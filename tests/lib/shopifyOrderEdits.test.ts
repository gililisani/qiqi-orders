import { describe, expect, it } from 'vitest';
import {
  editNeedsReview,
  planAddedLines,
  planEditInvoice,
  planLineClosures,
  type ShopifyLineState,
  type SoLineState,
} from '@/lib/shopify/core/orderEdits';
import { buildRefundPlans, type RefundPlan } from '@/lib/shopify/core/refundTransform';
import { ensureOrderEdits, closeUnshippableLines } from '@/lib/shopify/engine/edits';
import { ensureRefunds } from '@/lib/shopify/engine/refund';
import { buildOrderPlan } from '@/lib/shopify/core/orderTransform';
import { ENGINE_CONFIG } from '@/lib/shopify/engine/config';
import type { NsApi } from '@/lib/shopify/engine/pipeline';
import type { OrderPlan } from '@/lib/shopify/core/types';
import { loadOrder } from '../helpers/shopifyFixtures';

// #7641's shape (synthetic): sold FPS0019 $42 + FPS0017 $56, paid $98; an edit
// removed FPS0017 ($0 refund) and added FPS0030 $64 with an $8 line discount.
const line = (o: Partial<ShopifyLineState> & { sku: string; id: string }): ShopifyLineState => ({
  shopifyLineItemId: o.id,
  description: o.sku,
  quantity: 1,
  currentQuantity: 1,
  netAmountCents: 0,
  discountCents: 0,
  taxLines: [],
  ...o,
});
const LINES = [
  line({ id: '1', sku: 'FPS0019', netAmountCents: 4200 }),
  line({ id: '2', sku: 'FPS0017', netAmountCents: 5600, currentQuantity: 0 }),
  line({ id: '3', sku: 'FPS0030', netAmountCents: 5600, discountCents: 800 }),
];
const ITEMS = new Map([['FPS0019', '19'], ['FPS0017', '17'], ['FPS0030', '30']]);
const SKUS = new Map([...ITEMS].map(([s, i]) => [i, s]));
const so = (o: Partial<SoLineState> & { lineId: number; itemId: string }): SoLineState => ({
  quantity: 1,
  quantityBilled: 1,
  quantityFulfilled: 0,
  isClosed: false,
  ...o,
});
const BOOKED = [so({ lineId: 1, itemId: '19' }), so({ lineId: 2, itemId: '17' })];

const REMOVAL: RefundPlan = {
  kind: 'removal',
  shopifyRefundId: '900',
  shopifyOrderId: '7641000',
  orderName: '#7641',
  createdAt: '2026-10-22T19:50:31Z',
  note: null,
  lines: [{ sku: 'FPS0017', shopifyLineItemId: '2', quantity: 1, restock: true, subtotalCents: 5600, taxCents: 0 }],
  residualCents: 0,
  transactions: [],
  totalCents: 0,
};
const plan = (over: Partial<OrderPlan> = {}): OrderPlan =>
  ({
    orderName: '#7641',
    shopifyOrderId: '7641000',
    lines: LINES.map((l) => ({ ...l, originalUnitPriceCents: 0 })),
    taxLines: [],
    shipping: null,
    fxAdjustmentCents: 0,
    payments: [{ shopifyTransactionId: 't1', gateway: 'shopify_payments', amountCents: 9800, processedAt: '2026-10-14T15:53:44Z', feeCents: null }],
    ...over,
  }) as unknown as OrderPlan;

describe('order edit planning', () => {
  it('finds the item added after booking, at catalog price with its line discount', () => {
    expect(planAddedLines(LINES, BOOKED, ITEMS)).toEqual([
      expect.objectContaining({ sku: 'FPS0030', itemId: '30', quantity: 1, amountCents: 6400, discountCents: 800 }),
    ]);
    // Once on the SO, nothing is added twice.
    expect(planAddedLines(LINES, [...BOOKED, so({ lineId: 3, itemId: '30', quantityBilled: 0 })], ITEMS)).toEqual([]);
    // A non-stock product already on the SO counts as booked (never billed twice).
    expect(planAddedLines(LINES, [...BOOKED, so({ lineId: 3, itemId: '30', itemType: 'NonInvtPart' })], ITEMS)).toEqual([]);
  });

  it('bills only the unbilled SO lines: catalog − discount', () => {
    const lines = [...BOOKED, so({ lineId: 3, itemId: '30', quantityBilled: 0 })];
    expect(planEditInvoice(LINES, lines, SKUS)).toEqual({ lineIds: [3], discountCents: 800, taxLines: [], expectedCents: 5600 });
    expect(planEditInvoice(LINES, BOOKED, SKUS)).toBeNull();
  });

  it('an even swap books automatically; one that moves money parks for a human', () => {
    const added = planAddedLines(LINES, BOOKED, ITEMS);
    expect(editNeedsReview(plan(), [REMOVAL], added)).toBeNull(); // 154 sold − 98 paid − 56 removed = 0
    // Removed with nothing added: the customer is owed $56.
    const removedOnly = plan({ lines: LINES.slice(0, 2).map((l) => ({ ...l, originalUnitPriceCents: 0 })) as any });
    expect(editNeedsReview(removedOnly, [REMOVAL], [])).toMatch(/\$56\.00 overpaid/);
    // A payment taken after the edit.
    const paidLater = plan({
      payments: [
        ...plan().payments,
        { shopifyTransactionId: 't2', gateway: 'shopify_payments', amountCents: 0, processedAt: '2026-10-23T10:00:00Z', feeCents: null },
      ] as any,
    });
    expect(editNeedsReview(paidLater, [REMOVAL], added)).toMatch(/payment was taken after the edit/);
    // No edit at all → nothing to review.
    expect(editNeedsReview(plan(), [], [])).toBeNull();
  });

  it('closes lines that will never ship — whole lines only', () => {
    const shipped = new Map([['FPS0019', 1], ['FPS0030', 1]]);
    const afterShipment = [
      so({ lineId: 1, itemId: '19', quantityFulfilled: 1 }),
      so({ lineId: 2, itemId: '17' }),
      so({ lineId: 3, itemId: '30', quantityFulfilled: 1 }),
    ];
    expect(planLineClosures(LINES, afterShipment, shipped, SKUS)).toEqual([2]);
    // Nothing shipped yet and nothing removed → nothing closes.
    const open = [line({ id: '1', sku: 'FPS0019' })];
    expect(planLineClosures(open, [so({ lineId: 1, itemId: '19' })], new Map(), SKUS)).toEqual([]);
    // 2 sold, 1 removed: can't close half a line until the other unit ships.
    const two = [line({ id: '1', sku: 'FPS0019', quantity: 2, currentQuantity: 1 })];
    expect(planLineClosures(two, [so({ lineId: 1, itemId: '19', quantity: 2 })], new Map(), SKUS)).toEqual([]);
    expect(planLineClosures(two, [so({ lineId: 1, itemId: '19', quantity: 2, quantityFulfilled: 1 })], new Map([['FPS0019', 1]]), SKUS)).toEqual([1]);
    // A non-stock product line never closes (it doesn't ship).
    const svc = [line({ id: '1', sku: 'FPS0019', currentQuantity: 0 })];
    expect(planLineClosures(svc, [so({ lineId: 1, itemId: '19', itemType: 'Service' })], new Map(), SKUS)).toEqual([]);
    // Whole order cancelled and refunded (#7424): every line closes.
    const cancelled = [line({ id: '1', sku: 'FPS0019', currentQuantity: 0 }), line({ id: '2', sku: 'FPS0017', quantity: 2, currentQuantity: 0 })];
    expect(planLineClosures(cancelled, [so({ lineId: 1, itemId: '19' }), so({ lineId: 2, itemId: '17', quantity: 2 })], new Map(), SKUS)).toEqual([1, 2]);
  });

  it('a $0 refund with lines is a removal, not a broken refund', () => {
    const order = loadOrder('refunded-full') as any;
    order.refunds[0].totalRefundedSet.shopMoney.amount = '0.0';
    order.refunds[0].transactions.nodes = [];
    const { plans, issues } = buildRefundPlans(order);
    expect(issues).toEqual([]);
    expect(plans[0]).toMatchObject({ kind: 'removal', totalCents: 0, residualCents: 0, transactions: [] });
  });
});

/** In-memory NetSuite for the edit steps. */
function fakeNs(soLines: SoLineState[], opts: { invoiceTotal?: string; openInvoices?: Array<{ id: string; foreignamountunpaid: string }> } = {}) {
  const calls: Array<{ op: string; type?: string; id?: string; payload?: any }> = [];
  let nextLine = Math.max(0, ...soLines.map((s) => s.lineId)) + 1;
  const ns: NsApi = {
    async findRecordIdByExternalId() {
      return null;
    },
    async createRecord(type, payload) {
      calls.push({ op: 'create', type, payload });
      return 'cm-1';
    },
    async updateRecord(type, id, payload) {
      calls.push({ op: 'update', type, id, payload });
      if (type === 'salesOrder') {
        for (const it of (payload as any).item.items) {
          if (it.line) soLines.find((s) => s.lineId === it.line)!.isClosed = it.isClosed;
          else soLines.push({ lineId: nextLine++, itemId: it.item.id, quantity: it.quantity, quantityBilled: 0, quantityFulfilled: 0, isClosed: false });
        }
      }
    },
    async transformRecord(from, fromId, to, body) {
      calls.push({ op: 'transform', type: `${from}→${to}`, id: fromId, payload: body });
      return 'inv-2';
    },
    async suiteQL(q: string) {
      if (q.includes('FROM transactionline')) {
        return soLines.map((s) => ({ id: s.lineId, item: s.itemId, itemtype: s.itemType ?? 'Assembly', quantity: -s.quantity, quantitybilled: -s.quantityBilled, quantityshiprecv: -s.quantityFulfilled, isclosed: s.isClosed ? 'T' : 'F' })) as any;
      }
      if (q.includes('SELECT foreigntotal')) return [{ foreigntotal: opts.invoiceTotal ?? '56' }] as any;
      if (q.includes("type = 'CustInvc'")) return (opts.openInvoices ?? []) as any;
      return [];
    },
    async resolveItemIdsBySku(skus) {
      return new Map(skus.map((s) => [s, ITEMS.get(s)!]));
    },
  };
  return { ns, calls, soLines };
}

/** A Shopify order shaped like #7641 after the edit (synthetic). */
function editedOrder() {
  const o = loadOrder('b2c-latest') as any;
  const base = o.lineItems.nodes[0];
  const mk = (id: string, sku: string, unit: string, current: number, discount = '0.0') => ({
    ...base,
    id: `gid://shopify/LineItem/${id}`,
    sku,
    name: sku,
    quantity: 1,
    currentQuantity: current,
    originalUnitPriceSet: { shopMoney: { amount: unit } },
    originalTotalSet: { shopMoney: { amount: unit } },
    discountAllocations: discount === '0.0' ? [] : [{ allocatedAmountSet: { shopMoney: { amount: discount } }, discountApplication: { index: 0 } }],
    taxLines: [],
  });
  o.lineItems.nodes = [mk('1', 'FPS0019', '42.0', 1), mk('2', 'FPS0017', '56.0', 0), mk('3', 'FPS0030', '64.0', 1, '8.0')];
  o.taxLines = [];
  o.shippingLines.nodes = [];
  o.transactions = [{ ...o.transactions[0], kind: 'SALE', status: 'SUCCESS', gateway: 'shopify_payments', processedAt: '2026-10-14T15:53:44Z', amountSet: { shopMoney: { amount: '98.0', currencyCode: 'USD' } } }];
  o.refunds = [{ id: 'gid://shopify/Refund/900', createdAt: '2026-10-22T19:50:31Z', note: null, totalRefundedSet: { shopMoney: { amount: '0.0' } }, refundLineItems: { nodes: [{ quantity: 1, restockType: 'CANCEL', restocked: true, lineItem: { id: 'gid://shopify/LineItem/2', sku: 'FPS0017' }, subtotalSet: { shopMoney: { amount: '56.0' } }, totalTaxSet: { shopMoney: { amount: '0.0' } } }] }, transactions: { nodes: [] } }];
  o.fulfillments = [{ id: 'gid://shopify/Fulfillment/1', status: 'SUCCESS', createdAt: '2026-10-22T20:34:47Z', trackingInfo: [], fulfillmentLineItems: { nodes: [{ quantity: 1, lineItem: { id: 'gid://shopify/LineItem/1', sku: 'FPS0019' } }, { quantity: 1, lineItem: { id: 'gid://shopify/LineItem/3', sku: 'FPS0030' } }] } }];
  return o;
}

describe('order edit engine steps (#7641 shape)', () => {
  it('adds the new item to the SO and bills it on an edit invoice with its discount', async () => {
    const order = editedOrder();
    const p = buildOrderPlan(order);
    const { ns, calls, soLines } = fakeNs(BOOKED.map((s) => ({ ...s })));
    const r = await ensureOrderEdits(order, p, buildRefundPlans(order).plans, 'so-1', ns, ENGINE_CONFIG);
    expect(r).toEqual({ addedLines: 1, editInvoiceIds: ['inv-2'] });
    const add = calls.find((c) => c.op === 'update' && c.type === 'salesOrder')!;
    expect(add.payload.item.items).toEqual([expect.objectContaining({ item: { id: '30' }, quantity: 1, amount: 64 })]);
    expect(add.payload.item.items[0]).not.toHaveProperty('line');
    const inv = calls.find((c) => c.op === 'transform')!;
    expect(inv.type).toBe('salesOrder→invoice');
    expect(inv.payload).toMatchObject({ externalId: `SHOPINVE-${p.shopifyOrderId}-3`, discountRate: -8, shippingCost: 0, tranDate: '2026-10-22' });
    expect(soLines).toHaveLength(3);
  });

  it('parks — before writing anything — when the edit moved money', async () => {
    const order = editedOrder();
    order.lineItems.nodes = order.lineItems.nodes.slice(0, 2); // removed FPS0017, added nothing
    const { ns, calls } = fakeNs(BOOKED.map((s) => ({ ...s })));
    const err = await ensureOrderEdits(order, buildOrderPlan(order), buildRefundPlans(order).plans, 'so-1', ns, ENGINE_CONFIG).catch((e) => e);
    expect(err.issue.code).toBe('ORDER_EDIT_NEEDS_REVIEW');
    expect(calls).toEqual([]);
  });

  it('the edit invoice must total what Shopify charged, or it parks', async () => {
    const order = editedOrder();
    const { ns } = fakeNs(BOOKED.map((s) => ({ ...s })), { invoiceTotal: '64' });
    const err = await ensureOrderEdits(order, buildOrderPlan(order), buildRefundPlans(order).plans, 'so-1', ns, ENGINE_CONFIG).catch((e) => e);
    expect(err.issue.code).toBe('ORDER_EDIT_NEEDS_REVIEW');
    expect(err.message).toMatch(/expected \$56\.00/);
  });

  it('the removal becomes a credit with no money back, applied to the open invoice', async () => {
    const order = editedOrder();
    const p = buildOrderPlan(order);
    const { ns, calls } = fakeNs([], { openInvoices: [{ id: '501', foreignamountunpaid: '0' }, { id: '502', foreignamountunpaid: '56' }] });
    const r = await ensureRefunds(buildRefundPlans(order).plans, p, 'cust', ns, ENGINE_CONFIG, { orderHasNsFulfillment: true });
    expect(r.created).toEqual({ creditMemos: 1, refunds: 0 });
    const cm = calls.find((c) => c.op === 'create')!;
    expect(cm.payload.item.items).toEqual([expect.objectContaining({ amount: 56, description: 'Removed from order · FPS0017 ×1' })]);
    expect(cm.payload.memo).toMatch(/items removed in an order edit/);
    expect(calls.find((c) => c.op === 'update' && c.type === 'creditMemo')!.payload).toEqual({
      apply: { items: [{ doc: 502, apply: true, amount: 56 }] },
    });
    expect(calls.some((c) => c.op === 'transform')).toBe(false); // no customer refund

    // Re-run once applied: nothing owed any more → no second application, no error.
    const again = fakeNs([], { openInvoices: [{ id: '502', foreignamountunpaid: '0' }] });
    await ensureRefunds(buildRefundPlans(order).plans, p, 'cust', again.ns, ENGINE_CONFIG, { orderHasNsFulfillment: true });
    expect(again.calls.filter((c) => c.type === 'creditMemo' && c.op === 'update')).toEqual([]);
  });

  it('after the shipment, the removed line closes and nothing else', async () => {
    const order = editedOrder();
    const lines = [
      so({ lineId: 1, itemId: '19', quantityFulfilled: 1 }),
      so({ lineId: 2, itemId: '17' }),
      so({ lineId: 3, itemId: '30', quantityFulfilled: 1 }),
    ];
    const { ns, calls } = fakeNs(lines);
    expect(await closeUnshippableLines(order, buildOrderPlan(order), 'so-1', ns)).toEqual([2]);
    expect(calls).toEqual([{ op: 'update', type: 'salesOrder', id: 'so-1', payload: { item: { items: [{ line: 2, isClosed: true }] } } }]);
  });
});
