import { describe, expect, it } from 'vitest';
import {
  allowedDecisions,
  reviewStatus,
  suggestFromNetSuite,
  suggestTarget,
  undoBlockers,
  validateDecision,
  type DecisionContext,
  type ReviewDoc,
  type ReviewRow,
} from '@/lib/salesLedger/review';

const doc = (over: Partial<ReviewDoc> = {}): ReviewDoc => ({
  id: 'd1',
  company_id: 'c1',
  doc_type: 'invoice',
  order_id: null,
  sales_amount: 1000,
  support_fund: 0,
  ...over,
});

const ctx = (over: Partial<DecisionContext> = {}): DecisionContext => ({
  companyId: 'c1',
  orders: new Map([
    ['o-done', 'Done'],
    ['o-draft', 'Draft'],
    ['o-cancelled', 'Cancelled'],
  ]),
  outsideSaleIds: new Set(['inv-outside']),
  linkedOrderStatus: null,
  ...over,
});

describe('reviewStatus', () => {
  it('invoices NetSuite links to a live Hub order need no decision', () => {
    expect(reviewStatus(doc({ order_id: 'o-done' }), 'Done', null)).toBe('auto');
    expect(reviewStatus(doc({ order_id: 'o-x' }), 'Ready', null)).toBe('auto');
  });
  it('an invoice linked to a cancelled order still needs review', () => {
    expect(reviewStatus(doc({ order_id: 'o-cancelled' }), 'Cancelled', null)).toBe('to_review');
  });
  it('documents with no products and no support funds have nothing to count', () => {
    expect(reviewStatus(doc({ sales_amount: 0 }), null, null)).toBe('nothing_to_count');
    expect(reviewStatus(doc({ sales_amount: 0, support_fund: 50 }), null, null)).toBe('to_review');
  });
  it('a decision wins over everything else', () => {
    const r: ReviewRow = { document_id: 'd1', decision: 'ignore', order_id: null, attached_document_id: null, reason: 'x' };
    expect(reviewStatus(doc({ sales_amount: 0 }), null, r)).toBe('decided');
  });
});

describe('allowedDecisions', () => {
  it('invoices: add to sales, attach to a Hub order, ignore; credits never add sales', () => {
    expect(allowedDecisions('invoice')).toEqual(['outside_sale', 'attach', 'ignore']);
    expect(allowedDecisions('cash_sale')).toEqual(['outside_sale', 'attach', 'ignore']);
    expect(allowedDecisions('credit_memo')).toEqual(['attach', 'company_credit', 'ignore']);
    expect(allowedDecisions('cash_refund')).toEqual(['attach', 'company_credit', 'ignore']);
  });
});

describe('validateDecision', () => {
  it('accepts the plain decisions', () => {
    expect(validateDecision(doc(), { decision: 'outside_sale' }, ctx())).toBeNull();
    expect(validateDecision(doc(), { decision: 'ignore', reason: 'Private label' }, ctx())).toBeNull();
    expect(validateDecision(doc({ doc_type: 'credit_memo', sales_amount: -200 }), { decision: 'company_credit' }, ctx())).toBeNull();
  });

  it('ignore needs a reason', () => {
    expect(validateDecision(doc(), { decision: 'ignore', reason: '  ' }, ctx())).toMatch(/why/);
  });

  it('a credit is never added to sales; an invoice is never a company credit', () => {
    expect(validateDecision(doc({ doc_type: 'credit_memo' }), { decision: 'outside_sale' }, ctx())).toMatch(/credit/);
    expect(validateDecision(doc(), { decision: 'company_credit' }, ctx())).toMatch(/invoice/);
  });

  it('attach: exactly one live order of the same company', () => {
    expect(validateDecision(doc(), { decision: 'attach', orderId: 'o-done' }, ctx())).toBeNull();
    expect(validateDecision(doc(), { decision: 'attach' }, ctx())).toMatch(/one order/);
    expect(validateDecision(doc(), { decision: 'attach', orderId: 'o-other-company' }, ctx())).toMatch(/another company/);
    expect(validateDecision(doc(), { decision: 'attach', orderId: 'o-draft' }, ctx())).toMatch(/draft/);
    expect(validateDecision(doc(), { decision: 'attach', orderId: 'o-cancelled' }, ctx())).toMatch(/cancelled/);
  });

  it('a credit can attach to an outside sale; an invoice cannot', () => {
    const credit = doc({ id: 'cm1', doc_type: 'credit_memo', sales_amount: -300 });
    expect(validateDecision(credit, { decision: 'attach', attachedDocumentId: 'inv-outside' }, ctx())).toBeNull();
    expect(validateDecision(credit, { decision: 'attach', attachedDocumentId: 'inv-not-added' }, ctx())).toMatch(/already added/);
    expect(validateDecision(credit, { decision: 'attach', attachedDocumentId: 'cm1' }, ctx({ outsideSaleIds: new Set(['cm1']) }))).toMatch(/itself/);
    expect(validateDecision(doc(), { decision: 'attach', attachedDocumentId: 'inv-outside' }, ctx())).toMatch(/Hub order/);
    expect(validateDecision(credit, { decision: 'attach', orderId: 'o-done', attachedDocumentId: 'inv-outside' }, ctx())).toMatch(/one order/);
  });

  it('only attach takes a target', () => {
    expect(validateDecision(doc(), { decision: 'outside_sale', orderId: 'o-done' }, ctx())).toMatch(/Only/);
  });

  it('refuses documents of another company and invoices NetSuite already linked', () => {
    expect(validateDecision(doc({ company_id: 'c2' }), { decision: 'outside_sale' }, ctx())).toMatch(/another company/);
    expect(validateDecision(doc({ order_id: 'o-done' }), { decision: 'outside_sale' }, ctx({ linkedOrderStatus: 'Done' }))).toMatch(/already links/);
  });
});

describe('undoBlockers', () => {
  it('lists the credits attached to an outside sale', () => {
    const reviews: ReviewRow[] = [
      { document_id: 'cm1', decision: 'attach', order_id: null, attached_document_id: 'inv1', reason: null },
      { document_id: 'cm2', decision: 'attach', order_id: 'o1', attached_document_id: null, reason: null },
    ];
    expect(undoBlockers('inv1', reviews)).toEqual(['cm1']);
    expect(undoBlockers('inv2', reviews)).toEqual([]);
  });
});


describe('suggestTarget', () => {
  const orders = [
    { id: 'o1', po_number: 'P00806', status: 'Done' },
    { id: 'o2', po_number: '7PYGR3', status: 'Cancelled' },
  ];
  const docs = [
    { id: 'inv-hub', doc_type: 'invoice', tranid: 'INVUS15458', order_id: 'o1' },
    { id: 'inv-out', doc_type: 'invoice', tranid: 'INVIL10927', order_id: null },
  ];
  it('a credit naming a Hub-order invoice points at that order', () => {
    expect(suggestTarget({ id: 'cm', doc_type: 'credit_memo', po_ref: null, memo: 'Damaged — INVUS15458' }, orders, docs))
      .toMatchObject({ kind: 'order', id: 'o1' });
  });
  it('a credit naming an invoice sold outside the Hub points at that invoice', () => {
    expect(suggestTarget({ id: 'cm', doc_type: 'credit_memo', po_ref: null, memo: 'credit for INVIL10927' }, orders, docs))
      .toMatchObject({ kind: 'document', id: 'inv-out' });
  });
  it('falls back to a live Hub order whose PO it mentions; never a cancelled one', () => {
    expect(suggestTarget({ id: 'x', doc_type: 'invoice', po_ref: 'P00806', memo: null }, orders, docs)).toMatchObject({ kind: 'order', id: 'o1' });
    expect(suggestTarget({ id: 'x', doc_type: 'invoice', po_ref: '7PYGR3', memo: null }, orders, docs)).toBeNull();
    expect(suggestTarget({ id: 'x', doc_type: 'invoice', po_ref: null, memo: null }, orders, docs)).toBeNull();
  });
});

describe('suggestFromNetSuite', () => {
  const orders = new Map([
    ['o1', { po_number: 'P00806', status: 'Done' }],
    ['o-x', { po_number: 'XX', status: 'Cancelled' }],
  ]);
  const docsByNsId = new Map([
    ['100', { id: 'inv-hub', company_id: 'c1', tranid: 'INVUS15458', order_id: 'o1' }],
    ['101', { id: 'inv-out', company_id: 'c1', tranid: 'INVIL10927', order_id: null }],
    ['102', { id: 'inv-ign', company_id: 'c1', tranid: 'INVIL10237', order_id: null }],
    ['103', { id: 'inv-new', company_id: 'c1', tranid: 'INVIL11000', order_id: null }],
    ['104', { id: 'inv-c2', company_id: 'c2', tranid: 'INVUS1', order_id: null }],
  ]);
  const reviews = new Map<string, any>([
    ['inv-out', { decision: 'outside_sale', order_id: null, reason: null }],
    ['inv-ign', { decision: 'ignore', order_id: null, reason: 'Before Engagement' }],
  ]);
  const ctx = { docsByNsId, reviews, orders };
  const credit = (ids: string[], tranids: string[], link = 'created_from') => ({
    id: 'cm', company_id: 'c1', doc_type: 'credit_memo', credited_invoice_ns_ids: ids, credited_invoice_tranids: tranids, credit_link: link,
  });

  it('points at the Hub order behind the invoice NetSuite links', () => {
    expect(suggestFromNetSuite(credit(['100'], ['INVUS15458']), ctx)).toMatchObject({ kind: 'order', id: 'o1', label: 'P00806', why: 'NetSuite: created from INVUS15458' });
  });
  it('points at an invoice billed externally; says which link it came through', () => {
    expect(suggestFromNetSuite(credit(['101'], ['INVIL10927'], 'return_authorization'), ctx)).toMatchObject({
      kind: 'document', id: 'inv-out', why: 'NetSuite: return authorization on INVIL10927',
    });
  });
  it('suggests ignoring when its invoice was ignored or is outside the Hub history', () => {
    expect(suggestFromNetSuite(credit(['102'], ['INVIL10237']), ctx)).toMatchObject({ kind: 'ignore', label: 'Credit on ignored invoice INVIL10237 (Before Engagement)' });
    expect(suggestFromNetSuite(credit(['999'], ['INVIL10194']), ctx)).toMatchObject({ kind: 'ignore' });
    expect(suggestFromNetSuite(credit(['104'], ['INVUS1']), ctx)).toMatchObject({ kind: 'ignore' }); // another company's invoice
  });
  it('an undecided invoice is still the suggestion (add it to sales first)', () => {
    expect(suggestFromNetSuite(credit(['103'], ['INVIL11000']), ctx)).toMatchObject({ kind: 'document', id: 'inv-new' });
  });
  it('several invoices → a note; no link or not a credit → nothing', () => {
    expect(suggestFromNetSuite(credit(['100', '101'], ['INVUS15458', 'INVIL10927'], 'return_authorization_order'), ctx)).toMatchObject({ kind: 'note' });
    expect(suggestFromNetSuite(credit([], []), ctx)).toBeNull();
    expect(suggestFromNetSuite({ ...credit(['100'], ['X']), doc_type: 'invoice' }, ctx)).toBeNull();
  });
});

