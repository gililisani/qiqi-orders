/**
 * NetSuite review — server-side loading shared by the review page, the
 * decision endpoint and the overview. Throws on any query error (never
 * renders a partial review as if it were complete).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { reviewStatus, type ReviewDoc, type ReviewRow, type ReviewStatus } from './review';

export interface StoredReview extends ReviewRow {
  decided_by: string | null;
  decided_at: string;
}

export interface LoadedDoc extends ReviewDoc {
  doc_type: string;
  tranid: string;
  doc_date: string;
  currency: string;
  total_foreign: number;
  total_amount: number;
  excluded_amount: number;
  po_ref: string | null;
  memo: string | null;
  so_tranid: string | null;
  netsuite_id: string;
  credited_invoice_ns_ids: string[];
  credited_invoice_tranids: string[];
  credit_link: string | null;
  lines?: Array<{ line_no: number; kind: string; sku: string | null; item_name: string | null; quantity: number; amount: number }>;
}

export interface LoadedOrder {
  id: string;
  company_id: string;
  po_number: string | null;
  status: string;
  total_value: number | null;
  created_at: string;
}

const CHUNK = 150;

async function inChunks<T>(ids: string[], run: (part: string[]) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await run(ids.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

const DOC_COLUMNS =
  'id, company_id, doc_type, tranid, doc_date, currency, total_foreign, total_amount, sales_amount, excluded_amount, support_fund, order_id, po_ref, memo, so_tranid, netsuite_id, credited_invoice_ns_ids, credited_invoice_tranids, credit_link';

/** Documents, orders and decisions for a set of companies (all of them when `companyIds` is null). */
export async function loadReviewState(
  supabase: SupabaseClient,
  companyIds: string[] | null,
  opts: { withLines?: boolean } = {}
): Promise<{ docs: LoadedDoc[]; orders: LoadedOrder[]; reviews: Map<string, StoredReview> }> {
  const columns = opts.withLines
    ? `${DOC_COLUMNS}, lines:sales_document_lines(line_no, kind, sku, item_name, quantity, amount)`
    : DOC_COLUMNS;
  const [docsRaw, orders] = await Promise.all([
    selectAll<any>((a, b) => {
      let q = supabase.from('sales_documents').select(columns).order('doc_date', { ascending: false }).order('id');
      if (companyIds) q = q.in('company_id', companyIds);
      return q.range(a, b);
    }),
    selectAll<LoadedOrder>((a, b) => {
      let q = supabase.from('orders').select('id, company_id, po_number, status, total_value, created_at').order('created_at', { ascending: false }).order('id');
      if (companyIds) q = q.in('company_id', companyIds);
      return q.range(a, b);
    }),
  ]);
  const docs: LoadedDoc[] = docsRaw.map((d) => ({
    ...d,
    sales_amount: Number(d.sales_amount) || 0,
    support_fund: Number(d.support_fund) || 0,
    excluded_amount: Number(d.excluded_amount) || 0,
    total_foreign: Number(d.total_foreign) || 0,
    total_amount: Number(d.total_amount) || 0,
    lines: d.lines
      ? (d.lines as any[]).map((l) => ({ ...l, quantity: Number(l.quantity) || 0, amount: Number(l.amount) || 0 })).sort((x, y) => x.line_no - y.line_no)
      : undefined,
  }));
  const reviewRows = await inChunks<StoredReview>(
    docs.map((d) => d.id),
    (part) =>
      supabase
        .from('sales_document_reviews')
        .select('document_id, decision, order_id, attached_document_id, reason, decided_by, decided_at')
        .in('document_id', part)
  );
  return { docs, orders, reviews: new Map(reviewRows.map((r) => [r.document_id, r])) };
}

/** Each document's review status (order status comes from the loaded orders). */
export function statusesFor(docs: LoadedDoc[], orders: LoadedOrder[], reviews: Map<string, StoredReview>): Map<string, ReviewStatus> {
  const orderStatus = new Map(orders.map((o) => [o.id, o.status]));
  return new Map(
    docs.map((d) => [d.id, reviewStatus(d, d.order_id ? orderStatus.get(d.order_id) ?? null : null, reviews.get(d.id) ?? null)])
  );
}

/** Admin display names for the decided_by ids. */
export async function adminNames(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map();
  const rows = await inChunks<{ id: string; name: string | null; email: string | null }>(unique, (part) =>
    supabase.from('admins').select('id, name, email').in('id', part)
  );
  return new Map(rows.map((r) => [r.id, r.name || r.email || 'Admin']));
}
