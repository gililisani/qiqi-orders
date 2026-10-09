/**
 * Sales ledger — sync from the ERP into sales_documents / _lines.
 *
 * Full mirror per company for the configured window (Settings → Sales):
 * every document is upserted by its ERP id, its lines are replaced, and
 * ledger documents the ERP no longer returns (deleted) are removed. Each
 * document is linked to the Hub order whose sales order billed it (falling
 * back to the order's recorded invoice). Read-only towards the ERP.
 *
 * A mirror only: no report reads it (owner 2026-10-08 — Hub first; sales
 * from NetSuite count only after an admin approves them). It feeds the
 * company Sales (NetSuite) page.
 *
 * Not atomic per company (PostgREST): a failure mid-company leaves that
 * company partly written and recorded in sales_company_sync.last_error; the
 * next run repairs it (everything is idempotent).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NetSuiteAPI } from '../netsuite';
import { buildLedgerDocument, narrowCreditedInvoices, toSalesRule, type CatalogProduct, type ErpDocument, type LedgerDocument, type SalesRule } from './classify';
import { fetchErpDocuments } from './netsuite';

export interface SyncSummary {
  skipped?: string;
  companies: number;
  documents: number;
  lines: number;
  removed: number;
  errors: Array<{ companyId: string; company: string; error: string }>;
  durationMs: number;
}

interface HubOrderLink {
  id: string;
  company_id: string;
  so_number: string | null;
  netsuite_so_id: string | null;
  invoice_number: string | null;
  netsuite_invoice_id: string | null;
}

const norm = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase();

/** The Hub order a document belongs to: its sales order first, then the order's recorded invoice. */
export function linkDocumentToOrder(
  doc: Pick<LedgerDocument, 'netsuite_id' | 'tranid' | 'netsuite_so_id' | 'so_tranid'>,
  orders: HubOrderLink[]
): string | null {
  if (doc.netsuite_so_id || doc.so_tranid) {
    const bySo = orders.find(
      (o) =>
        (doc.netsuite_so_id && o.netsuite_so_id === doc.netsuite_so_id) ||
        (doc.so_tranid && norm(o.so_number) === norm(doc.so_tranid))
    );
    if (bySo) return bySo.id;
  }
  const byInvoice = orders.find(
    (o) =>
      o.netsuite_invoice_id === doc.netsuite_id ||
      (!!o.invoice_number && !!doc.tranid && norm(o.invoice_number).includes(norm(doc.tranid)))
  );
  return byInvoice?.id ?? null;
}

async function loadRule(supabase: SupabaseClient): Promise<SalesRule> {
  const { data, error } = await supabase.from('sales_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error(`sales settings: ${error.message}`);
  return toSalesRule(data);
}

/** Every row of a query, past PostgREST's 1,000-row page. */
async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

function inChunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function syncSalesLedger(
  supabase: SupabaseClient,
  ns: Pick<NetSuiteAPI, 'suiteQLPaged'>,
  opts: { companyIds?: string[] } = {}
): Promise<SyncSummary> {
  const started = Date.now();
  const summary: SyncSummary = {
    companies: 0,
    documents: 0,
    lines: 0,
    removed: 0,
    errors: [],
    durationMs: 0,
  };
  const rule = await loadRule(supabase);
  if (!rule.historyStartDate) {
    return { ...summary, skipped: 'Settings → Sales has no history start date yet.', durationMs: Date.now() - started };
  }

  const [allCompanies, products, orders] = await Promise.all([
    selectAll<any>((a, b) => {
      let q = supabase.from('companies').select('id, company_name, netsuite_internal_id').order('id').range(a, b);
      if (opts.companyIds?.length) q = q.in('id', opts.companyIds);
      return q;
    }),
    selectAll<any>((a, b) =>
      supabase.from('Products').select('id, sku, qualifies_for_credit_earning').order('id').range(a, b)
    ),
    selectAll<HubOrderLink>((a, b) =>
      supabase
        .from('orders')
        .select('id, company_id, so_number, netsuite_so_id, invoice_number, netsuite_invoice_id')
        .order('id')
        .range(a, b)
    ),
  ]);

  const companies = allCompanies.filter((c) => /^\d+$/.test(String(c.netsuite_internal_id ?? '').trim()));
  const catalog = new Map<string, CatalogProduct>(
    products
      .filter((p) => p.sku)
      .map((p) => [
        String(p.sku).trim().toUpperCase(),
        { id: Number(p.id), earnsSupportFund: p.qualifies_for_credit_earning !== false },
      ])
  );

  const byCustomer = await fetchErpDocuments(
    ns,
    companies.map((c) => Number(String(c.netsuite_internal_id).trim())),
    rule.historyStartDate
  );

  for (const company of companies) {
    const companyId = String(company.id);
    try {
      const erpDocs: ErpDocument[] = byCustomer.get(String(company.netsuite_internal_id).trim()) ?? [];
      const companyOrders = orders.filter((o) => o.company_id === companyId);
      const byErpId = new Map(erpDocs.map((d) => [d.erpId, d]));
      const built = erpDocs.map((d) => buildLedgerDocument(narrowCreditedInvoices(d, byErpId), rule, catalog));
      const now = new Date().toISOString();

      const rows = built.map(({ lines, ...doc }) => ({
        ...doc,
        company_id: companyId,
        order_id: linkDocumentToOrder(doc, companyOrders),
        synced_at: now,
      }));
      const idByErp = new Map<string, string>();
      for (const part of inChunks(rows, 300)) {
        const { data, error } = await supabase
          .from('sales_documents')
          .upsert(part, { onConflict: 'netsuite_id' })
          .select('id, netsuite_id');
        if (error) throw new Error(`documents: ${error.message}`);
        for (const r of data ?? []) idByErp.set(String(r.netsuite_id), String(r.id));
      }

      const docIds = [...idByErp.values()];
      for (const part of inChunks(docIds, 200)) {
        const { error } = await supabase.from('sales_document_lines').delete().in('document_id', part);
        if (error) throw new Error(`clear lines: ${error.message}`);
      }
      const lineRows = built.flatMap((d) =>
        d.lines.map((l) => ({ ...l, document_id: idByErp.get(d.netsuite_id)! }))
      );
      for (const part of inChunks(lineRows, 1000)) {
        const { error } = await supabase.from('sales_document_lines').insert(part);
        if (error) throw new Error(`lines: ${error.message}`);
      }

      // Documents the ERP no longer returns for this window were deleted there.
      const existing = await selectAll<{ id: string; netsuite_id: string }>((a, b) =>
        supabase
          .from('sales_documents')
          .select('id, netsuite_id')
          .eq('company_id', companyId)
          .gte('doc_date', rule.historyStartDate!)
          .order('id')
          .range(a, b)
      );
      const stale = existing.filter((e) => !idByErp.has(String(e.netsuite_id))).map((e) => e.id);
      for (const part of inChunks(stale, 200)) {
        const { error } = await supabase.from('sales_documents').delete().in('id', part);
        if (error) throw new Error(`remove deleted: ${error.message}`);
      }

      const { error: stateErr } = await supabase.from('sales_company_sync').upsert({
        company_id: companyId,
        last_synced_at: now,
        last_error: null,
        document_count: rows.length,
      });
      if (stateErr) throw new Error(`sync state: ${stateErr.message}`);

      summary.companies += 1;
      summary.documents += rows.length;
      summary.lines += lineRows.length;
      summary.removed += stale.length;
    } catch (err: any) {
      const message = String(err?.message || err);
      summary.errors.push({ companyId, company: String(company.company_name), error: message });
      await supabase
        .from('sales_company_sync')
        .upsert({ company_id: companyId, last_error: message.slice(0, 500) });
    }
  }

  summary.durationMs = Date.now() - started;
  return summary;
}
