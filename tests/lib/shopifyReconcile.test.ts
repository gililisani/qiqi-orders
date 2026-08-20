import { describe, expect, it } from 'vitest';
import { reconcileOrders, expectedInvoiceCents } from '@/lib/shopify/engine/reconcile';
import type { NsApi } from '@/lib/shopify/engine/pipeline';
import { ENGINE_CONFIG } from '@/lib/shopify/engine/config';
import { buildOrderPlan } from '@/lib/shopify/core/orderTransform';
import { buildFulfillmentPlans } from '@/lib/shopify/core/fulfillmentTransform';
import { buildRefundPlans } from '@/lib/shopify/core/refundTransform';
import type { ShopifyOrder } from '@/lib/shopify/core/types';
import type { ShopifySyncStore } from '@/lib/shopify/store';
import { loadOrder, fixtureSkus } from '../helpers/shopifyFixtures';

/** NS double: externalid map + per-transaction totals for SuiteQL. */
function fakeNs(byExt: Record<string, string> = {}, totals: Record<string, number> = {}) {
  const ns: NsApi = {
    async findRecordIdByExternalId(type, extId) {
      return byExt[`${type}:${extId}`] ?? null;
    },
    async createRecord() {
      throw new Error('recon must never create');
    },
    async updateRecord() {
      throw new Error('recon must never update');
    },
    async transformRecord() {
      throw new Error('recon must never transform');
    },
    async suiteQL(query: string) {
      const m = query.match(/WHERE id = (\d+)/);
      if (m && totals[m[1]] !== undefined) return [{ foreigntotal: String(totals[m[1]]) }] as any;
      return [];
    },
    async resolveItemIdsBySku(skus) {
      return new Map(skus.map((s) => [s, `item-${s}`]));
    },
  };
  return ns;
}

/** Store double: state rows + recorded mutations. */
function fakeStore(rows: Record<string, any> = {}, netscoreOrders: Set<string> = new Set()) {
  const errors: Array<{ orderId: string; code: string; message: string }> = [];
  const skips: Array<{ orderId: string; reason: string }> = [];
  const store = {
    async getSkuAliases() {
      return new Map<string, string>();
    },
    async hasNetscoreSalesOrder(id: string) {
      return netscoreOrders.has(id);
    },
    async getOrderRow(id: string) {
      return rows[id] ?? null;
    },
    async seenOrder() {},
    async setState() {},
    async markSkipped(orderId: string, reason: string) {
      skips.push({ orderId, reason });
    },
    async markError(orderId: string, issues: any[]) {
      errors.push({ orderId, code: issues[0].code, message: issues[0].message });
    },
    async event() {},
  } as unknown as ShopifySyncStore;
  return { store, errors, skips };
}

function numId(order: ShopifyOrder): string {
  return order.id.replace(/^.*\//, '');
}

/** externalid map for a fully-booked order, per the engine's namespaces. */
function bookedExt(order: ShopifyOrder): { byExt: Record<string, string>; totals: Record<string, number> } {
  const plan = buildOrderPlan(order);
  const id = numId(order);
  const byExt: Record<string, string> = {
    [`salesOrder:SHOPORD-${id}`]: '9001',
    [`invoice:SHOPINV-${id}`]: '9002',
  };
  const totals: Record<string, number> = { '9002': expectedInvoiceCents(plan) / 100 };
  plan.payments.forEach((p, i) => {
    byExt[`customerpayment:SHOPPAY-${p.shopifyTransactionId}`] = String(9100 + i);
  });
  buildFulfillmentPlans(order).forEach((f, i) => {
    byExt[`itemFulfillment:SHOPFUL-${f.shopifyFulfillmentId}`] = String(9200 + i);
  });
  buildRefundPlans(order).plans.forEach((r, i) => {
    const cmId = String(9300 + i);
    byExt[`creditMemo:SHOPCM-${r.shopifyRefundId}`] = cmId;
    totals[cmId] = (r.lines.reduce((s, l) => s + l.subtotalCents + l.taxCents, 0) + r.residualCents) / 100;
  });
  return { byExt, totals };
}

const NOW = () => new Date('2099-01-01T00:00:00Z'); // every fixture is older than the grace window

function baseDeps(order: ShopifyOrder, over: Partial<Parameters<typeof reconcileOrders>[0]> = {}) {
  return {
    ns: fakeNs(),
    config: ENGINE_CONFIG,
    nsTarget: 'production' as const,
    fetchOrdersCreatedBetween: async () => [order],
    loadKnownSkus: async () => fixtureSkus(),
    now: NOW,
    ...over,
  };
}

describe('reconcileOrders', () => {
  it('books MISSING_ORDER when a syncable order has no state row', async () => {
    const order = loadOrder('b2c-latest');
    const { store, errors } = fakeStore();
    const r = await reconcileOrders({ store, ...baseDeps(order) });
    expect(r.flagged).toHaveLength(1);
    expect(r.flagged[0].code).toBe('MISSING_ORDER');
    expect(errors[0].orderId).toBe(numId(order));
  });

  it('missing state row + existing NS chain → adopts and verifies instead of carding (DB-reset safety)', async () => {
    const order = loadOrder('b2c-latest');
    const { byExt, totals } = bookedExt(order);
    const { store, errors, skips } = fakeStore(); // no rows at all
    const r = await reconcileOrders({ store, ...baseDeps(order, { ns: fakeNs(byExt, totals) }) });
    expect(errors).toHaveLength(0);
    expect(skips).toHaveLength(0);
    expect(r.clean).toBe(1);
  });

  it('a fully-booked order verifies clean to the cent', async () => {
    const order = loadOrder('b2c-latest');
    const { byExt, totals } = bookedExt(order);
    const { store, errors } = fakeStore({ [numId(order)]: { state: 'paid', ns_target: 'production' } });
    const r = await reconcileOrders({ store, ...baseDeps(order, { ns: fakeNs(byExt, totals) }) });
    expect(errors).toHaveLength(0);
    expect(r.clean).toBe(1);
    expect(r.flagged).toHaveLength(0);
  });

  it('flags RECON_MISMATCH when the invoice total is off by a cent', async () => {
    const order = loadOrder('b2c-latest');
    const { byExt, totals } = bookedExt(order);
    totals['9002'] += 0.01;
    const { store, errors } = fakeStore({ [numId(order)]: { state: 'paid', ns_target: 'production' } });
    const r = await reconcileOrders({ store, ...baseDeps(order, { ns: fakeNs(byExt, totals) }) });
    expect(r.flagged).toHaveLength(1);
    expect(errors[0].code).toBe('RECON_MISMATCH');
    expect(errors[0].message).toContain('invoice total');
  });

  it('flags a missing payment', async () => {
    const order = loadOrder('multi-tax-domestic'); // split tender: 2 payments
    const plan = buildOrderPlan(order);
    expect(plan.payments.length).toBeGreaterThan(1);
    const { byExt, totals } = bookedExt(order);
    delete byExt[`customerpayment:SHOPPAY-${plan.payments[1].shopifyTransactionId}`];
    const { store, errors } = fakeStore({ [numId(order)]: { state: 'paid', ns_target: 'production' } });
    await reconcileOrders({ store, ...baseDeps(order, { ns: fakeNs(byExt, totals) }) });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('payment');
  });

  it('NetScore-era orders (snapshot stamp) are counted, never checked, never carded', async () => {
    const order = loadOrder('b2c-latest');
    const { store, errors } = fakeStore({}, new Set([numId(order)]));
    const r = await reconcileOrders({ store, ...baseDeps(order) });
    expect(r.netscoreEra).toBe(1);
    expect(r.checked).toBe(0);
    expect(errors).toHaveLength(0);
  });

  it('sandbox target ignores the NetScore snapshot (QA re-books deliberately)', async () => {
    const order = loadOrder('b2c-latest');
    const { byExt, totals } = bookedExt(order);
    const { store } = fakeStore(
      { [numId(order)]: { state: 'paid', ns_target: 'sandbox' } },
      new Set([numId(order)]),
    );
    const r = await reconcileOrders({
      store,
      ...baseDeps(order, { ns: fakeNs(byExt, totals), nsTarget: 'sandbox' as const }),
    });
    expect(r.netscoreEra).toBe(0);
    expect(r.clean).toBe(1);
  });

  it('skipped / ignored / already-error rows are left alone', async () => {
    const a = loadOrder('b2c-latest');
    const b = loadOrder('b2b-latest');
    const { store, errors } = fakeStore({
      [numId(a)]: { state: 'skipped', skip_reason: 'TEST_ORDER' },
      [numId(b)]: { state: 'error', error_code: 'UNKNOWN_SKU' },
    });
    const r = await reconcileOrders({
      store,
      ...baseDeps(a, { fetchOrdersCreatedBetween: async () => [a, b] }),
    });
    expect(r.skippedOrIgnored).toBe(1);
    expect(r.alreadyError).toBe(1);
    expect(errors).toHaveLength(0);
  });

  it('refunded order: CM verified against the refund amount', async () => {
    const order = loadOrder('refunded-full');
    const refund = buildRefundPlans(order).plans[0];
    const { byExt, totals } = bookedExt(order);
    delete byExt[`creditMemo:SHOPCM-${refund.shopifyRefundId}`];
    const { store, errors } = fakeStore({ [numId(order)]: { state: 'refunded', ns_target: 'production' } });
    await reconcileOrders({ store, ...baseDeps(order, { ns: fakeNs(byExt, totals) }) });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('credit memo');
  });

  it('refunded order with a booked, correct CM verifies clean', async () => {
    const order = loadOrder('refunded-full');
    const { byExt, totals } = bookedExt(order);
    const { store, errors } = fakeStore({ [numId(order)]: { state: 'refunded', ns_target: 'production' } });
    const r = await reconcileOrders({ store, ...baseDeps(order, { ns: fakeNs(byExt, totals) }) });
    expect(errors).toHaveLength(0);
    expect(r.clean).toBe(1);
  });
});
