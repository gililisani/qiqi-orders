import { describe, expect, it } from 'vitest';
import { buildOrderPlan, replacementInfo, salesOrderMemo } from '@/lib/shopify/core/orderTransform';
import { gateOrder, zeroOrderDeferral } from '@/lib/shopify/core/validate';
import { buildReplacementRows } from '@/lib/shopify/replacements';
import { fixtureSkus, loadOrder, zeroOrder } from '../helpers/shopifyFixtures';

describe('replacementInfo', () => {
  it('reads the order replaced and the reason from the note', () => {
    expect(replacementInfo({ tags: ['Replacement'], note: 'Replacement for #7369 – damaged' })).toEqual({
      forOrder: '#7369',
      reason: 'damaged',
    });
    expect(replacementInfo({ tags: [], note: 'replacement for 7507 - lost in transit' })).toEqual({
      forOrder: '#7507',
      reason: 'lost in transit',
    });
  });

  it('a tag alone marks a replacement without an order number', () => {
    expect(replacementInfo({ tags: ['B2B', ' replacement '], note: null })).toEqual({ forOrder: null, reason: null });
  });

  it('caps a long reason and keeps the number when no reason follows', () => {
    const long = `Replacement for #7507 – ${'the package was lost by the carrier and never arrived '.repeat(3)}`;
    expect(replacementInfo({ tags: [], note: long })!.reason!.length).toBeLessThanOrEqual(80);
    expect(replacementInfo({ tags: [], note: 'Replacement for #7369' })).toEqual({ forOrder: '#7369', reason: null });
  });

  it('normal orders are not replacements', () => {
    expect(replacementInfo({ tags: ['B2B', 'ispro'], note: 'Please leave at the door' })).toBeNull();
  });
});

describe('salesOrderMemo', () => {
  it('names the replaced order and the reason', () => {
    expect(
      salesOrderMemo({ orderName: '#7507', discountCodes: [], presentment: null, replacement: { forOrder: '#7369', reason: 'damaged' } }),
    ).toBe('Shopify #7507 · replacement for #7369 (damaged)');
  });

  it('normal orders are unchanged', () => {
    expect(salesOrderMemo({ orderName: '#7600', discountCodes: ['SAVE10'], presentment: null, replacement: null })).toBe(
      'Shopify #7600 · discount: SAVE10',
    );
  });
});

describe('$0 orders', () => {
  it('a $0 replacement passes the gate and carries the replacement on its plan', () => {
    const order = zeroOrder();
    expect(gateOrder(order, fixtureSkus())).toEqual({ outcome: 'proceed' });
    expect(buildOrderPlan(order).replacement).toEqual({ forOrder: '#7369', reason: 'damaged in transit' });
  });

  it('waits until it ships', () => {
    expect(zeroOrderDeferral(zeroOrder())).toMatchObject({ reason: 'ZERO_NOT_SHIPPED' });
  });

  it('cancelled before shipping → never booked', () => {
    const order = zeroOrder();
    order.cancelledAt = '2026-10-20T12:00:00Z';
    expect(zeroOrderDeferral(order)).toMatchObject({ reason: 'ZERO_CANCELLED' });
  });

  it('books once shipped', () => {
    const order = zeroOrder();
    order.fulfillments = loadOrder('b2c-latest').fulfillments;
    expect(order.fulfillments.some((f) => f.status === 'SUCCESS')).toBe(true);
    expect(zeroOrderDeferral(order)).toBeNull();
  });

  it('paid orders are never deferred', () => {
    expect(zeroOrderDeferral(loadOrder('b2c-latest'))).toBeNull();
  });
});

describe('buildReplacementRows', () => {
  const row = (name: string, forOrder: string | null, extra: Record<string, unknown> = {}) => ({
    shopify_order_id: name.slice(1),
    order_name: name,
    order_created_at: '2026-10-01T00:00:00Z',
    state: 'skipped',
    skip_reason: 'ZERO_NOT_SHIPPED',
    ns_fulfillment_ids: null,
    ns_target: 'production',
    plan: { replacement: { forOrder, reason: 'lost' }, lines: [{ sku: 'QB-100', quantity: 2 }] },
    ...extra,
  });

  it('follows the chain to the original order and labels status and cost', () => {
    const rows = buildReplacementRows(
      [
        row('#7559', '#7507', { state: 'cancelled', skip_reason: null, ns_fulfillment_ids: [] }),
        row('#7507', '#7369', { state: 'fulfilled', skip_reason: null, ns_fulfillment_ids: ['633423'] }),
        row('#7700', null),
      ],
      new Map([['633423', 754]]),
    );
    expect(rows[0]).toMatchObject({ forOrder: '#7507', rootOrder: '#7369', status: 'cancelled', costCents: null });
    expect(rows[1]).toMatchObject({ forOrder: '#7369', rootOrder: '#7369', status: 'shipped', costCents: 754, items: ['2 × QB-100'] });
    expect(rows[2]).toMatchObject({ forOrder: null, rootOrder: null, status: 'waiting' });
  });

  it('a chain that loops back on itself stops', () => {
    const rows = buildReplacementRows([row('#1', '#2'), row('#2', '#1')]);
    expect(rows).toHaveLength(2);
  });
});
