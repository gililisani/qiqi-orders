/**
 * Sales ledger — per-company reconciliation (pure).
 *
 * Puts Hub orders next to what the ERP actually billed:
 *  - each Hub order: billed so far (its documents) vs the Hub total →
 *    billed / partly billed (backorder or price difference) / billed more /
 *    not billed yet / cancelled but billed;
 *  - each document: from a Hub order or sold outside the Hub; dated before
 *    the client's agreement (never counts toward targets); and, when it is
 *    not linked, whether its PO reference names a Hub order (an order that
 *    was entered in the ERP by hand instead of pushed — e.g. a price fix).
 */

export interface ReconOrder {
  id: string;
  po_number: string | null;
  status: string;
  total_value: number | null;
  created_at: string;
}

export interface ReconDocument {
  id: string;
  doc_type: string;
  tranid: string;
  doc_date: string;
  sales_amount: number;
  support_fund: number;
  excluded_amount: number;
  currency: string;
  order_id: string | null;
  po_ref: string | null;
  memo: string | null;
  so_tranid: string | null;
}

export type OrderBillingState =
  | 'billed'
  | 'partly_billed'
  | 'billed_more'
  | 'not_billed'
  | 'cancelled_but_billed';

export interface OrderReconciliation {
  orderId: string;
  poNumber: string | null;
  status: string;
  hubTotal: number;
  billed: number;
  difference: number; // billed − Hub total
  documents: string[];
  state: OrderBillingState;
}

export interface DocumentReconciliation extends ReconDocument {
  origin: 'hub' | 'outside_hub';
  beforeAgreement: boolean;
  suggestedOrder: { id: string; poNumber: string } | null;
}

export interface CompanyReconciliation {
  totals: {
    sales: number;
    salesSinceAgreement: number;
    salesBeforeAgreement: number;
    outsideHub: number;
    supportFund: number;
    unbilledHubOrders: number;
  };
  orders: OrderReconciliation[];
  documents: DocumentReconciliation[];
}

const round2 = (n: number) => Math.round(n * 100) / 100 || 0; // never -0
const norm = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase();

export function reconcileCompany(input: {
  contractDate: string | null; // YYYY-MM-DD
  orders: ReconOrder[];
  documents: ReconDocument[];
}): CompanyReconciliation {
  const { contractDate } = input;
  const orders = input.orders.filter((o) => o.status !== 'Draft');
  const docsByOrder = new Map<string, ReconDocument[]>();
  for (const d of input.documents) {
    if (!d.order_id) continue;
    if (!docsByOrder.has(d.order_id)) docsByOrder.set(d.order_id, []);
    docsByOrder.get(d.order_id)!.push(d);
  }

  const orderRows: OrderReconciliation[] = orders.map((o) => {
    const docs = docsByOrder.get(o.id) ?? [];
    const billed = round2(docs.reduce((s, d) => s + Number(d.sales_amount || 0), 0));
    const hubTotal = round2(Number(o.total_value || 0));
    const difference = round2(billed - hubTotal);
    let state: OrderBillingState;
    if (o.status === 'Cancelled') state = docs.length ? 'cancelled_but_billed' : 'not_billed';
    else if (!docs.length) state = 'not_billed';
    else if (Math.abs(difference) <= 0.01) state = 'billed';
    else state = difference < 0 ? 'partly_billed' : 'billed_more';
    return {
      orderId: o.id,
      poNumber: o.po_number,
      status: o.status,
      hubTotal,
      billed,
      difference,
      documents: docs.map((d) => d.tranid),
      state,
    };
  });

  const linkedOrderIds = new Set(input.documents.map((d) => d.order_id).filter(Boolean) as string[]);
  const documents: DocumentReconciliation[] = input.documents
    .slice()
    .sort((a, b) => (a.doc_date < b.doc_date ? 1 : a.doc_date > b.doc_date ? -1 : a.tranid < b.tranid ? 1 : -1))
    .map((d) => {
      let suggestedOrder: DocumentReconciliation['suggestedOrder'] = null;
      if (!d.order_id) {
        const text = norm(`${d.po_ref ?? ''} ${d.memo ?? ''}`);
        const hit = orders.find(
          (o) => o.status !== 'Cancelled' && !linkedOrderIds.has(o.id) && norm(o.po_number).length >= 4 && text.includes(norm(o.po_number))
        );
        if (hit) suggestedOrder = { id: hit.id, poNumber: String(hit.po_number) };
      }
      return {
        ...d,
        origin: d.order_id ? 'hub' : 'outside_hub',
        beforeAgreement: !!contractDate && d.doc_date < contractDate,
        suggestedOrder,
      };
    });

  const sum = (list: ReconDocument[]) => round2(list.reduce((s, d) => s + Number(d.sales_amount || 0), 0));
  const before = documents.filter((d) => d.beforeAgreement);
  return {
    totals: {
      sales: sum(documents),
      salesSinceAgreement: sum(documents.filter((d) => !d.beforeAgreement)),
      salesBeforeAgreement: sum(before),
      outsideHub: sum(documents.filter((d) => d.origin === 'outside_hub')),
      supportFund: round2(documents.reduce((s, d) => s + Number(d.support_fund || 0), 0)),
      unbilledHubOrders: round2(
        orderRows
          .filter((o) => o.status !== 'Cancelled' && (o.state === 'not_billed' || o.state === 'partly_billed'))
          .reduce((s, o) => s + Math.max(0, o.hubTotal - o.billed), 0)
      ),
    },
    orders: orderRows,
    documents,
  };
}
