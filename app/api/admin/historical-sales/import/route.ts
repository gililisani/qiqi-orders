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

/**
 * Double-count guard: everything the company's Hub orders know about their
 * invoices. Two match paths — the NS internal id, and the order's
 * invoice_number TEXT containing the invoice tranid. The text path exists
 * for split-invoice orders (invoice_number like "INVIL10899+INVIL10901",
 * netsuite_invoice_id NULL), whose invoices would otherwise slip through
 * and double-count.
 */
async function fetchOrderGuard(
  supabase: ReturnType<typeof createServiceRoleClient>,
  companyId: string
): Promise<{ nsIds: Set<string>; invoiceTexts: string[] }> {
  const { data, error } = await supabase
    .from('orders')
    .select('netsuite_invoice_id, invoice_number')
    .eq('company_id', companyId)
    .or('netsuite_invoice_id.not.is.null,invoice_number.not.is.null');
  if (error) throw error;
  return {
    nsIds: new Set(
      (data || []).map((o) => o.netsuite_invoice_id).filter(Boolean) as string[]
    ),
    invoiceTexts: (data || [])
      .map((o) => String(o.invoice_number || '').trim().toUpperCase())
      .filter(Boolean),
  };
}

function isHubOrderInvoice(
  guard: { nsIds: Set<string>; invoiceTexts: string[] },
  nsInvoiceId: string,
  tranid: string
): boolean {
  if (guard.nsIds.has(nsInvoiceId)) return true;
  const ref = tranid.trim().toUpperCase();
  if (!ref) return false;
  // Tolerant containment, never strict-equal — catches "A+B" combined refs.
  return guard.invoiceTexts.some((t) => t.includes(ref));
}

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
 * Lines for a set of NS invoices. mainline/taxline filtered out; assembly
 * component sub-lines (NULL netamount AND NULL foreignamount) excluded.
 *
 * Two derived facts per line, matching how this account stored things
 * across the years:
 *  - `reduction`: the SF signal. The ONLY universal marker of a line that
 *    reduces the invoice is `foreignamount > 0` (NS invoice sign
 *    convention: revenue negative). Covers all three observed patterns:
 *    Discount-type SF items (netamount 0), item-less HEADER discounts
 *    (netamount 0, memo e.g. "Distributor Support Fund" — INVIL10722),
 *    and negative-priced product lines (free goods).
 *  - `isItem`: whether the line is a real product line for
 *    historical_sale_items (has an item, not Discount-type). Amounts are
 *    sign-flipped so revenue is positive; negative-priced product lines
 *    stay negative and per-invoice item sums reconcile with the total.
 */
async function fetchInvoiceLines(
  ns: ReturnType<typeof createNetSuiteAPI>,
  invoiceIds: number[]
): Promise<
  Map<
    string,
    Array<{ sku: string; item_name: string; quantity: number; amount: number; reduction: number; isItem: boolean }>
  >
> {
  const byInvoice = new Map<
    string,
    Array<{ sku: string; item_name: string; quantity: number; amount: number; reduction: number; isItem: boolean }>
  >();
  for (let i = 0; i < invoiceIds.length; i += 200) {
    const chunk = invoiceIds.slice(i, i + 200);
    const lines = await ns.suiteQLPaged<{
      transaction: string;
      itemid: string | null;
      displayname: string | null;
      itemtype: string | null;
      quantity: string | null;
      netamount: string | null;
      foreignamount: string | null;
    }>(
      `SELECT tl.transaction, i.itemid, i.displayname, i.itemtype, tl.quantity, tl.netamount, tl.foreignamount ` +
        `FROM transactionline tl LEFT JOIN item i ON i.id = tl.item ` +
        `WHERE tl.transaction IN (${chunk.join(', ')}) ` +
        `AND tl.mainline = 'F' AND tl.taxline = 'F' ` +
        `AND (tl.netamount IS NOT NULL OR tl.foreignamount IS NOT NULL)`
    );
    for (const l of lines) {
      const foreign = Number(l.foreignamount) || 0;
      const hasItem = !!l.itemid;
      const isDiscountType = (l.itemtype || '') === 'Discount';
      const key = String(l.transaction);
      if (!byInvoice.has(key)) byInvoice.set(key, []);
      byInvoice.get(key)!.push({
        sku: String(l.itemid || '').trim(),
        item_name: String(l.displayname || l.itemid || '').trim(),
        quantity: -(Number(l.quantity) || 0),
        amount: -(Number(l.netamount) || 0),
        reduction: foreign > 0 ? foreign : 0,
        isItem: hasItem && !isDiscountType && l.netamount !== null,
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

      // 2. Lines per invoice — item counts + the SF. Owner rule: EVERY row
      // that reduces the invoice is the SF (in positive). One universal
      // signal covers all three storage patterns this account used over
      // the years (Discount-type SF items, item-less header discounts,
      // negative-priced product lines): foreignamount > 0. Computed per
      // line inside fetchInvoiceLines as `reduction`.
      const sfByInvoice = new Map<string, number>();
      const countByInvoice = new Map<string, number>();
      {
        const linesByInvoice = await fetchInvoiceLines(
          ns,
          invoices.map((i) => Number(i.id)).filter(Number.isFinite)
        );
        for (const [nsId, lines] of linesByInvoice) {
          countByInvoice.set(nsId, lines.filter((l) => l.isItem).length);
          const sf = lines.reduce((s, l) => s + l.reduction, 0);
          if (sf > 0) sfByInvoice.set(nsId, sf);
        }
      }

      // 4. Flag invoices the Hub already knows about.
      const nsIds = invoices.map((i) => String(i.id));
      const [orderGuard, { data: imported }] = await Promise.all([
        fetchOrderGuard(supabase, companyId),
        supabase
          .from('historical_sales')
          .select('netsuite_invoice_id')
          .eq('company_id', companyId)
          .in('netsuite_invoice_id', nsIds),
      ]);
      const importedSet = new Set((imported || []).map((h) => h.netsuite_invoice_id));

      const rows: PreviewRow[] = invoices.map((inv) => ({
        netsuite_invoice_id: String(inv.id),
        reference: String(inv.tranid || inv.id),
        sale_date: normalizeNsDate(inv.trandate),
        amount: Number(inv.foreigntotal) || 0,
        support_fund: sfByInvoice.get(String(inv.id)) ?? 0,
        itemCount: countByInvoice.get(String(inv.id)) ?? 0,
        alreadyOrder: isHubOrderInvoice(orderGuard, String(inv.id), String(inv.tranid || '')),
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

      // Server-side double-count guard — never trust the client's
      // filtering: any invoice a Hub order already tracks (by NS id OR by
      // invoice-number text, incl. split-invoice "A+B" refs) is dropped.
      const guard = await fetchOrderGuard(supabase, companyId);
      const importable = clean.filter(
        (r) => !isHubOrderInvoice(guard, r.netsuite_invoice_id, r.reference)
      );
      const blocked = clean.length - importable.length;
      if (importable.length === 0) {
        return NextResponse.json(
          { error: 'All selected invoices are already tracked as Hub orders — nothing imported.' },
          { status: 400 }
        );
      }

      const { data: saved, error: upsertErr } = await supabase
        .from('historical_sales')
        .upsert(importable, { onConflict: 'company_id,netsuite_invoice_id' })
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
          importable.map((r) => Number(r.netsuite_invoice_id))
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
            if (!line.isItem) continue; // header discounts etc. live in support_fund
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

      return NextResponse.json({ success: true, imported: importable.length, items: itemCount, blocked });
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
