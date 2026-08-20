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
 *       netsuite_invoice_id) — re-importing repairs rather than duplicates.
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
  alreadyOrder: boolean;
  alreadyImported: boolean;
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

      const { error: upsertErr } = await supabase
        .from('historical_sales')
        .upsert(clean, { onConflict: 'company_id,netsuite_invoice_id' });
      if (upsertErr) throw upsertErr;

      return NextResponse.json({ success: true, imported: clean.length });
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
