/**
 * POST /api/admin/historical-sales/import — NetSuite import for a company's
 * historical (pre-Hub) sales.
 *
 * Two modes:
 *   { companyId, mode: 'preview', from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 *     → reads the company's NetSuite invoices in the range (read-only) and
 *       returns proposed rows: date, invoice #, net total, and the support
 *       fund read from the invoice's SF discount lines ("Marketing Support
 *       Funds …" / "Partners Support Funds" — discovered by name, tolerant
 *       match). Rows already present as Hub orders or already imported are
 *       flagged so the UI can exclude them.
 *   { companyId, mode: 'import', rows: [...] }
 *     → upserts the (admin-reviewed) rows keyed on (company_id,
 *       netsuite_invoice_id) — re-importing repairs rather than duplicates —
 *       then re-fetches each invoice's product lines from NetSuite
 *       (server-authoritative, the client can't tamper with them), matches
 *       them to the Hub catalog by SKU, and replaces the sale's items.
 *
 * Some old invoices carry SF as negative-priced product lines instead of a
 * discount item; those preview with support_fund 0 and the admin fills the
 * value in the preview table before importing.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdminWithPermission,
} from '../../../../../platform/auth/guards';
import { createNetSuiteAPI, normalizeNsDate } from '../../../../../lib/netsuite';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface PreviewRow {
  netsuite_invoice_id: string;
  reference: string;
  sale_date: string | null;
  amount: number;
  support_fund: number;
  itemCount: number;
  alreadyOrder: boolean;
  alreadyImported: boolean;
}

/**
 * Product lines for a set of NS invoices, catalog-ready. mainline/taxline
 * filtered out; component sub-lines of assemblies carry NULL netamount and
 * are excluded; Discount-type lines are excluded (the SF ones are captured
 * as support_fund, the value sits in foreignamount not netamount anyway).
 * NS sign convention on invoices is negative-for-revenue — flipped here, so
 * a positive-amount NS line (free goods / product-level discount) becomes a
 * negative item amount and per-invoice sums reconcile with the total.
 */
async function fetchInvoiceLines(
  ns: ReturnType<typeof createNetSuiteAPI>,
  invoiceIds: number[]
): Promise<Map<string, Array<{ sku: string; item_name: string; quantity: number; amount: number }>>> {
  const byInvoice = new Map<string, Array<{ sku: string; item_name: string; quantity: number; amount: number }>>();
  for (let i = 0; i < invoiceIds.length; i += 200) {
    const chunk = invoiceIds.slice(i, i + 200);
    const lines = await ns.suiteQLPaged<{
      transaction: string;
      itemid: string | null;
      displayname: string | null;
      itemtype: string | null;
      quantity: string | null;
      netamount: string | null;
    }>(
      `SELECT tl.transaction, i.itemid, i.displayname, i.itemtype, tl.quantity, tl.netamount ` +
        `FROM transactionline tl LEFT JOIN item i ON i.id = tl.item ` +
        `WHERE tl.transaction IN (${chunk.join(', ')}) ` +
        `AND tl.mainline = 'F' AND tl.taxline = 'F' AND tl.netamount IS NOT NULL`
    );
    for (const l of lines) {
      if ((l.itemtype || '') === 'Discount') continue;
      const key = String(l.transaction);
      if (!byInvoice.has(key)) byInvoice.set(key, []);
      byInvoice.get(key)!.push({
        sku: String(l.itemid || '').trim(),
        item_name: String(l.displayname || l.itemid || '').trim(),
        quantity: -(Number(l.quantity) || 0),
        amount: -(Number(l.netamount) || 0),
      });
    }
  }
  return byInvoice;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminWithPermission(request, 'companies:manage');
    const body = await request.json().catch(() => ({}));
    const companyId = String(body?.companyId || '');
    const mode = body?.mode;

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    if (mode === 'preview') {
      const from = String(body?.from || '');
      const to = String(body?.to || '');
      if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
        return NextResponse.json({ error: 'Valid from/to dates are required.' }, { status: 400 });
      }

      const { data: company } = await supabase
        .from('companies')
        .select('id, company_name, netsuite_internal_id')
        .eq('id', companyId)
        .single();
      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }
      if (!company.netsuite_internal_id || !/^\d+$/.test(company.netsuite_internal_id)) {
        return NextResponse.json(
          { error: 'This company has no NetSuite customer ID — set it on the company first.' },
          { status: 400 }
        );
      }

      if (!process.env.NETSUITE_ACCOUNT_ID) {
        return NextResponse.json(
          { error: 'NetSuite is not configured in this environment.' },
          { status: 503 }
        );
      }
      const ns = createNetSuiteAPI();

      // 1. The company's invoices in range. (Dates validated against
      //    ISO_DATE above — safe to inline into TO_DATE.)
      const invoices = await ns.suiteQLPaged<{
        id: string;
        tranid: string;
        trandate: string;
        foreigntotal: string | null;
      }>(
        `SELECT id, tranid, trandate, foreigntotal FROM transaction ` +
          `WHERE type = 'CustInvc' AND entity = ${Number(company.netsuite_internal_id)} ` +
          `AND trandate BETWEEN TO_DATE('${from}','YYYY-MM-DD') AND TO_DATE('${to}','YYYY-MM-DD') ` +
          `ORDER BY trandate`
      );

      if (invoices.length === 0) {
        return NextResponse.json({ company: company.company_name, rows: [] });
      }

      // 2. SF discount items, discovered by name (tolerant match — item set
      //    has changed over the years: "Marketing Support Funds 5%/10%",
      //    "Partners Support Funds").
      const sfItems = await ns.suiteQL<{ id: string }>(
        `SELECT id FROM item WHERE itemtype = 'Discount' AND LOWER(itemid) LIKE '%support fund%'`
      );
      const sfItemIds = sfItems.map((i) => Number(i.id)).filter(Number.isFinite);

      // 3. SF per invoice: discount lines keep their value in foreignamount
      //    (netamount is 0 on discount lines — account quirk, validated).
      const sfByInvoice = new Map<string, number>();
      if (sfItemIds.length > 0) {
        const invoiceIds = invoices.map((i) => Number(i.id)).filter(Number.isFinite);
        for (let i = 0; i < invoiceIds.length; i += 200) {
          const chunk = invoiceIds.slice(i, i + 200);
          const lines = await ns.suiteQL<{ transaction: string; sf: string | null }>(
            `SELECT tl.transaction, SUM(tl.foreignamount) AS sf FROM transactionline tl ` +
              `WHERE tl.transaction IN (${chunk.join(', ')}) ` +
              `AND tl.item IN (${sfItemIds.join(', ')}) GROUP BY tl.transaction`
          );
          for (const l of lines) {
            sfByInvoice.set(String(l.transaction), Number(l.sf) || 0);
          }
        }
      }

      // 3b. Line counts per invoice, for the preview table.
      const countByInvoice = new Map<string, number>();
      {
        const invoiceIds = invoices.map((i) => Number(i.id)).filter(Number.isFinite);
        for (let i = 0; i < invoiceIds.length; i += 200) {
          const chunk = invoiceIds.slice(i, i + 200);
          const counts = await ns.suiteQL<{ transaction: string; n: string }>(
            `SELECT tl.transaction, COUNT(*) AS n FROM transactionline tl ` +
              `LEFT JOIN item i ON i.id = tl.item ` +
              `WHERE tl.transaction IN (${chunk.join(', ')}) ` +
              `AND tl.mainline = 'F' AND tl.taxline = 'F' AND tl.netamount IS NOT NULL ` +
              `AND (i.itemtype IS NULL OR i.itemtype <> 'Discount') GROUP BY tl.transaction`
          );
          for (const c of counts) countByInvoice.set(String(c.transaction), Number(c.n) || 0);
        }
      }

      // 4. Flag invoices the Hub already knows about.
      const nsIds = invoices.map((i) => String(i.id));
      const [{ data: hubOrders }, { data: imported }] = await Promise.all([
        supabase
          .from('orders')
          .select('netsuite_invoice_id')
          .eq('company_id', companyId)
          .in('netsuite_invoice_id', nsIds),
        supabase
          .from('historical_sales')
          .select('netsuite_invoice_id')
          .eq('company_id', companyId)
          .in('netsuite_invoice_id', nsIds),
      ]);
      const orderSet = new Set((hubOrders || []).map((o) => o.netsuite_invoice_id));
      const importedSet = new Set((imported || []).map((h) => h.netsuite_invoice_id));

      const rows: PreviewRow[] = invoices.map((inv) => ({
        netsuite_invoice_id: String(inv.id),
        reference: String(inv.tranid || inv.id),
        sale_date: normalizeNsDate(inv.trandate),
        amount: Number(inv.foreigntotal) || 0,
        support_fund: sfByInvoice.get(String(inv.id)) ?? 0,
        itemCount: countByInvoice.get(String(inv.id)) ?? 0,
        alreadyOrder: orderSet.has(String(inv.id)),
        alreadyImported: importedSet.has(String(inv.id)),
      }));

      return NextResponse.json({ company: company.company_name, rows });
    }

    if (mode === 'import') {
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      if (rows.length === 0) {
        return NextResponse.json({ error: 'No rows to import.' }, { status: 400 });
      }
      if (rows.length > 2000) {
        return NextResponse.json({ error: 'Too many rows in one import.' }, { status: 400 });
      }

      const clean = [];
      for (const r of rows) {
        const nsId = String(r?.netsuite_invoice_id || '');
        const saleDate = String(r?.sale_date || '');
        const amount = Number(r?.amount);
        const supportFund = Number(r?.support_fund) || 0;
        if (!/^\d+$/.test(nsId) || !ISO_DATE.test(saleDate) || !Number.isFinite(amount)) {
          return NextResponse.json(
            { error: `Invalid row (invoice ${nsId || '?'}): date, amount and NetSuite id are required.` },
            { status: 400 }
          );
        }
        clean.push({
          company_id: companyId,
          netsuite_invoice_id: nsId,
          reference: String(r?.reference || nsId).slice(0, 100),
          sale_date: saleDate,
          amount,
          support_fund: supportFund,
          source: 'netsuite',
          created_by: user.id,
        });
      }

      const { data: saved, error: upsertErr } = await supabase
        .from('historical_sales')
        .upsert(clean, { onConflict: 'company_id,netsuite_invoice_id' })
        .select('id, netsuite_invoice_id');
      if (upsertErr) throw upsertErr;

      // Product lines: re-fetched from NetSuite (not trusted from the
      // client), matched to the Hub catalog by SKU, replacing any existing
      // items so re-imports repair.
      let itemCount = 0;
      if (process.env.NETSUITE_ACCOUNT_ID) {
        const ns = createNetSuiteAPI();
        const saleIdByNsId = new Map(
          (saved || []).map((s) => [String(s.netsuite_invoice_id), s.id as string])
        );
        const linesByInvoice = await fetchInvoiceLines(
          ns,
          clean.map((r) => Number(r.netsuite_invoice_id))
        );

        const { data: products } = await supabase.from('Products').select('id, sku');
        const productBySku = new Map(
          (products || [])
            .filter((p) => p.sku)
            .map((p) => [String(p.sku).trim().toUpperCase(), p.id as number])
        );

        const saleIds = Array.from(saleIdByNsId.values());
        const { error: delErr } = await supabase
          .from('historical_sale_items')
          .delete()
          .in('historical_sale_id', saleIds);
        if (delErr) throw delErr;

        const itemRows = [];
        for (const [nsId, lines] of linesByInvoice) {
          const saleId = saleIdByNsId.get(nsId);
          if (!saleId) continue;
          for (const line of lines) {
            itemRows.push({
              historical_sale_id: saleId,
              product_id: productBySku.get(line.sku.toUpperCase()) ?? null,
              sku: line.sku || null,
              item_name: line.item_name || null,
              quantity: line.quantity,
              amount: line.amount,
            });
          }
        }
        if (itemRows.length > 0) {
          const { error: itemsErr } = await supabase
            .from('historical_sale_items')
            .insert(itemRows);
          if (itemsErr) throw itemsErr;
        }
        itemCount = itemRows.length;
      }

      return NextResponse.json({ success: true, imported: clean.length, items: itemCount });
    }

    return NextResponse.json({ error: 'Unknown mode.' }, { status: 400 });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error in /api/admin/historical-sales/import:', error);
    return NextResponse.json(
      { error: error?.message || 'Import failed.' },
      { status: 500 }
    );
  }
}
