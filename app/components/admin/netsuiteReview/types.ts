/** Payload of GET /api/sales-ledger/company/[id] (NetSuite review). */

export type ReviewStatus = 'auto' | 'to_review' | 'decided' | 'nothing_to_count';
export type ReviewDecision = 'outside_sale' | 'attach' | 'company_credit' | 'ignore';
export type OrderState = 'billed' | 'partly_billed' | 'billed_more' | 'not_billed' | 'cancelled_but_billed';

export interface ReviewLine {
  line_no: number;
  kind: 'product' | 'discount' | 'excluded';
  sku: string | null;
  item_name: string | null;
  quantity: number;
  amount: number;
}

export interface ReviewDocument {
  id: string;
  docType: string;
  tranid: string;
  date: string;
  currency: string;
  totalForeign: number;
  totalAmount: number;
  sales: number;
  supportFund: number;
  excluded: number;
  poRef: string | null;
  memo: string | null;
  soTranid: string | null;
  linkedOrderId: string | null;
  /** order / document: attach there; ignore: ignore it (label = the reason); note: information only. */
  suggestion: { kind: 'order' | 'document' | 'ignore' | 'note'; id?: string; label: string; why: string } | null;
  creditedInvoices?: string[]; // credits: the invoice(s) NetSuite links them to
  status: ReviewStatus;
  review: {
    decision: ReviewDecision;
    orderId: string | null;
    attachedDocumentId: string | null;
    reason: string | null;
    decidedBy: string | null;
    decidedAt: string;
  } | null;
  creditsAttached: number;
  lines: ReviewLine[];
}

export interface AttachTargets {
  orders: Array<{ id: string; poNumber: string | null; status: string; total: number; createdAt: string }>;
  outsideSales: Array<{ id: string; tranid: string; date: string; sales: number }>;
}

export interface ReviewPayload {
  company: { id: string; name: string; netsuiteNumber: string | null; linked: boolean; contractDate: string | null };
  historyStartDate: string | null;
  sync: { last_synced_at: string | null; last_error: string | null; document_count: number } | null;
  counts: { toReviewInvoices: number; toReviewCredits: number; toReviewAmount: number; decided: number; auto: number; nothingToCount: number };
  decidedTotals: { outsideSales: number; credits: number };
  orders: Array<{
    orderId: string;
    poNumber: string | null;
    status: string;
    hubTotal: number;
    billed: number;
    difference: number;
    documents: string[];
    state: OrderState;
    credits: number;
    creditDocuments: string[];
    valueAfterCredits: number;
  }>;
  documents: ReviewDocument[];
  attachTargets: AttachTargets;
}

export const isCredit = (docType: string) => docType === 'credit_memo' || docType === 'cash_refund';

export const DOC_TYPE: Record<string, string> = {
  invoice: 'Invoice',
  credit_memo: 'Credit memo',
  cash_sale: 'Cash sale',
  cash_refund: 'Cash refund',
};
