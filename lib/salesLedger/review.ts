/**
 * NetSuite review — the rules for admin decisions on NetSuite documents
 * (owner 2026-10-08: Hub first; nothing from NetSuite counts until an admin
 * decides). Pure, so the rules are unit-tested; the API route only loads
 * rows and writes what these functions allow.
 *
 *  - Invoices / cash sales NetSuite already links to a live Hub order (same
 *    sales order) are "auto": they bill that order, no decision needed.
 *  - Documents with no products and no support funds (private label,
 *    shipping-only, zero invoices) have "nothing to count".
 *  - Everything else waits in "to review" until an admin decides:
 *      invoice / cash sale → outside_sale | attach (to a Hub order) | ignore
 *      credit memo / refund → attach (to a Hub order or an outside sale) |
 *                             company_credit | ignore
 *    Credits never carry support funds (owner: 95% damaged goods, the rest
 *    3PL short-shipments).
 */

export type ReviewDecision = 'outside_sale' | 'attach' | 'company_credit' | 'ignore';
export type ReviewStatus = 'auto' | 'to_review' | 'decided' | 'nothing_to_count';

export interface ReviewRow {
  document_id: string;
  decision: ReviewDecision;
  order_id: string | null;
  attached_document_id: string | null;
  reason: string | null;
}

export interface ReviewDoc {
  id: string;
  company_id: string;
  doc_type: string;
  order_id: string | null; // the Hub order NetSuite linked it to (same sales order)
  sales_amount: number;
  support_fund: number;
}

export const isCredit = (docType: string) => docType === 'credit_memo' || docType === 'cash_refund';

export function allowedDecisions(docType: string): ReviewDecision[] {
  return isCredit(docType) ? ['attach', 'company_credit', 'ignore'] : ['outside_sale', 'attach', 'ignore'];
}

/** Where a document stands. `linkedOrderStatus` = status of doc.order_id's order, if any. */
export function reviewStatus(doc: ReviewDoc, linkedOrderStatus: string | null, review: ReviewRow | null): ReviewStatus {
  if (review) return 'decided';
  if (doc.order_id && linkedOrderStatus && linkedOrderStatus !== 'Cancelled') return 'auto';
  if (Math.abs(Number(doc.sales_amount) || 0) < 0.005 && Math.abs(Number(doc.support_fund) || 0) < 0.005) {
    return 'nothing_to_count';
  }
  return 'to_review';
}

export interface DecisionInput {
  decision: ReviewDecision;
  orderId?: string | null;
  attachedDocumentId?: string | null;
  reason?: string | null;
}

export interface DecisionContext {
  companyId: string;
  /** The company's Hub orders: id → status. */
  orders: Map<string, string>;
  /** Documents of this company already decided as outside sales. */
  outsideSaleIds: Set<string>;
  /** Status of the order NetSuite linked the document to, if any. */
  linkedOrderStatus: string | null;
}

const MAX_REASON = 300;

/** Why this decision can't be saved, or null when it can. */
export function validateDecision(doc: ReviewDoc, input: DecisionInput, ctx: DecisionContext): string | null {
  if (doc.company_id !== ctx.companyId) return 'This document belongs to another company.';
  if (reviewStatus(doc, ctx.linkedOrderStatus, null) === 'auto') {
    return 'NetSuite already links this invoice to its Hub order — no decision needed.';
  }
  if (!allowedDecisions(doc.doc_type).includes(input.decision)) {
    return isCredit(doc.doc_type)
      ? 'A credit can be attached to an order, recorded for the company, or ignored.'
      : 'An invoice can be added to sales, attached to a Hub order, or ignored.';
  }
  const orderId = input.orderId || null;
  const attachedId = input.attachedDocumentId || null;
  const reason = (input.reason ?? '').trim();
  if (reason.length > MAX_REASON) return `Keep the reason under ${MAX_REASON} characters.`;

  if (input.decision === 'attach') {
    if (!!orderId === !!attachedId) return 'Choose the one order this belongs to.';
    if (orderId) {
      const status = ctx.orders.get(orderId);
      if (!status) return 'That order belongs to another company.';
      if (status === 'Draft' || status === 'Cancelled') return `A ${status.toLowerCase()} order can't take NetSuite documents.`;
    } else {
      if (!isCredit(doc.doc_type)) return 'An invoice can only be attached to a Hub order.';
      if (attachedId === doc.id) return 'A credit can’t be attached to itself.';
      if (!ctx.outsideSaleIds.has(attachedId!)) return 'Attach credits only to invoices already added to sales.';
    }
    return null;
  }
  if (orderId || attachedId) return 'Only “attach” takes an order.';
  if (input.decision === 'ignore' && !reason) return 'Say why this is ignored.';
  return null;
}

/** Credits that point at this outside sale — it can't be undone while they do. */
export function undoBlockers(documentId: string, reviews: ReviewRow[]): string[] {
  return reviews.filter((r) => r.attached_document_id === documentId).map((r) => r.document_id);
}

export interface SuggestedTarget {
  kind: 'order' | 'document';
  id: string;
  label: string; // PO number or invoice number
  why: string;
}

const norm = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase();

/**
 * A likely home for a document the admin is reviewing, from its PO
 * reference and memo: an invoice number it mentions (credits usually name
 * the invoice they credit — that invoice's Hub order, or the invoice itself
 * when it was sold outside the Hub), else a Hub order whose PO it mentions.
 * A suggestion only; the admin decides.
 */
export function suggestTarget(
  doc: { id: string; doc_type: string; po_ref: string | null; memo: string | null },
  orders: Array<{ id: string; po_number: string | null; status: string }>,
  docs: Array<{ id: string; doc_type: string; tranid: string; order_id: string | null }>
): SuggestedTarget | null {
  const text = norm(`${doc.po_ref ?? ''} ${doc.memo ?? ''}`);
  if (!text) return null;
  const live = (o: { status: string }) => o.status !== 'Draft' && o.status !== 'Cancelled';
  const orderById = new Map(orders.map((o) => [o.id, o]));

  if (isCredit(doc.doc_type)) {
    const invoice = docs.find((d) => d.id !== doc.id && !isCredit(d.doc_type) && norm(d.tranid).length >= 5 && text.includes(norm(d.tranid)));
    if (invoice) {
      const order = invoice.order_id ? orderById.get(invoice.order_id) : undefined;
      if (order && live(order)) {
        return { kind: 'order', id: order.id, label: order.po_number || invoice.tranid, why: `memo names ${invoice.tranid}` };
      }
      return { kind: 'document', id: invoice.id, label: invoice.tranid, why: `memo names ${invoice.tranid}` };
    }
  }
  const byPo = orders.find((o) => live(o) && norm(o.po_number).length >= 4 && text.includes(norm(o.po_number)));
  return byPo ? { kind: 'order', id: byPo.id, label: String(byPo.po_number), why: `PO ${byPo.po_number}` } : null;
}
