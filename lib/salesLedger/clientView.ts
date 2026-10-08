/**
 * What a client sees of the NetSuite review (owner 2026-10-08): invoices an
 * admin approved as billed externally appear in the client's order list,
 * read-only, marked "Billed Externally" — date, products, total, support
 * funds (the invoice's discount); credits attached to an order show on it.
 * Always scoped to one company; callers pass the caller's own company.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isCredit } from './review';

export interface ExternalSaleSummary {
  id: string;
  invoiceNumber: string;
  date: string;
  total: number;
  supportFund: number;
  credits: number; // credits attached (negative)
}

export interface CreditView {
  id: string;
  number: string;
  date: string;
  amount: number;
  products: Array<{ sku: string | null; name: string | null; quantity: number; amount: number }>;
}

const productLines = (lines: any[] | null | undefined) =>
  (lines ?? [])
    .filter((l) => l.kind === 'product')
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({
      sku: l.sku ?? null,
      name: l.item_name ?? null,
      quantity: Number(l.quantity) || 0,
      amount: Number(l.amount) || 0,
    }));

/** The caller's company (clients.company_id), or null. */
export async function clientCompanyId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('clients').select('company_id').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.company_id ?? null;
}

/** Approved "billed externally" invoices of one company, newest first, with credits attached. */
export async function listExternalSales(supabase: SupabaseClient, companyId: string): Promise<ExternalSaleSummary[]> {
  const { data: docs, error } = await supabase
    .from('sales_documents')
    .select('id, tranid, doc_date, sales_amount, support_fund')
    .eq('company_id', companyId)
    .order('doc_date', { ascending: false })
    .range(0, 4999);
  if (error) throw new Error(error.message);
  const ids = (docs ?? []).map((d) => d.id);
  const reviews: any[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error: rErr } = await supabase
      .from('sales_document_reviews')
      .select('document_id, decision, attached_document_id')
      .in('document_id', ids.slice(i, i + 150));
    if (rErr) throw new Error(rErr.message);
    reviews.push(...(data ?? []));
  }
  const outside = new Set(reviews.filter((r) => r.decision === 'outside_sale').map((r) => r.document_id));
  const amountById = new Map((docs ?? []).map((d) => [d.id, Number(d.sales_amount) || 0]));
  const credits = new Map<string, number>();
  for (const r of reviews) {
    if (r.decision === 'attach' && r.attached_document_id && outside.has(r.attached_document_id)) {
      credits.set(r.attached_document_id, (credits.get(r.attached_document_id) ?? 0) + (amountById.get(r.document_id) ?? 0));
    }
  }
  return (docs ?? [])
    .filter((d) => outside.has(d.id))
    .map((d) => ({
      id: d.id,
      invoiceNumber: d.tranid,
      date: d.doc_date,
      total: Number(d.sales_amount) || 0,
      supportFund: Number(d.support_fund) || 0,
      credits: credits.get(d.id) ?? 0,
    }));
}

/** One approved external sale of the company, with its products and credits; null when not visible. */
export async function getExternalSale(supabase: SupabaseClient, companyId: string, documentId: string) {
  const { data: review, error: rErr } = await supabase
    .from('sales_document_reviews')
    .select('decision')
    .eq('document_id', documentId)
    .maybeSingle();
  if (rErr) throw new Error(rErr.message);
  if (review?.decision !== 'outside_sale') return null;
  const { data: doc, error } = await supabase
    .from('sales_documents')
    .select('id, company_id, tranid, doc_date, sales_amount, support_fund, lines:sales_document_lines(line_no, kind, sku, item_name, quantity, amount)')
    .eq('id', documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!doc || doc.company_id !== companyId) return null;
  return {
    id: doc.id,
    invoiceNumber: doc.tranid,
    date: doc.doc_date,
    total: Number(doc.sales_amount) || 0,
    supportFund: Number(doc.support_fund) || 0,
    products: productLines((doc as any).lines),
    credits: await creditsAttached(supabase, { attachedDocumentId: documentId }),
  };
}

/** Credits attached to a Hub order or to an external sale, oldest first. */
export async function creditsAttached(
  supabase: SupabaseClient,
  target: { orderId: string } | { attachedDocumentId: string }
): Promise<CreditView[]> {
  let q = supabase.from('sales_document_reviews').select('document_id').eq('decision', 'attach');
  q = 'orderId' in target ? q.eq('order_id', target.orderId) : q.eq('attached_document_id', target.attachedDocumentId);
  const { data: reviews, error } = await q;
  if (error) throw new Error(error.message);
  if (!reviews?.length) return [];
  const { data: docs, error: dErr } = await supabase
    .from('sales_documents')
    .select('id, doc_type, tranid, doc_date, sales_amount, lines:sales_document_lines(line_no, kind, sku, item_name, quantity, amount)')
    .in('id', reviews.map((r) => r.document_id));
  if (dErr) throw new Error(dErr.message);
  return (docs ?? [])
    .filter((d) => isCredit(d.doc_type))
    .sort((a, b) => (a.doc_date < b.doc_date ? -1 : 1))
    .map((d) => ({
      id: d.id,
      number: d.tranid,
      date: d.doc_date,
      amount: Number(d.sales_amount) || 0,
      products: productLines((d as any).lines),
    }));
}
