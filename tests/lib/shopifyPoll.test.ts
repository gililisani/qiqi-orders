import { describe, expect, it } from 'vitest';
import { pollOrders } from '@/lib/shopify/engine/poll';
import type { ShopifySyncStore } from '@/lib/shopify/store';
import type { ShopifyOrder } from '@/lib/shopify/core/types';
import { fixtureSkus, loadOrder } from '../helpers/shopifyFixtures';

/** In-memory stand-in for ShopifySyncStore, recording everything. */
function fakeStore(mode: string, cursor: string | null = null) {
  const calls: Record<string, any[]> = { seen: [], state: [], events: [], config: [] };
  const states = new Map<string, string>();
  const store = {
    async getConfig() {
      return { mode, orders_cursor: cursor, fulfillments_cursor: null, payouts_cursor: null, last_poll_at: null, last_poll_error: null };
    },
    async updateConfig(patch: any) {
      calls.config.push(patch);
    },
    async seenOrder(order: ShopifyOrder, plan: any) {
      calls.seen.push({ name: order.name, hasPlan: !!plan });
    },
    async setState(id: string, state: string, fields: any = {}) {
      states.set(id, state);
      calls.state.push({ id, state, ...fields });
    },
    async markSkipped(id: string, reason: string) {
      states.set(id, 'skipped');
      calls.state.push({ id, state: 'skipped', reason });
    },
    async markError(id: string, issues: any[]) {
      states.set(id, 'error');
      calls.state.push({ id, state: 'error', issues });
    },
    async getOrderState(id: string) {
      return states.has(id) ? { state: states.get(id)!, retry_count: 0 } : null;
    },
    async event(loop: string, event: string, id: string | null, detail: any) {
      calls.events.push({ loop, event, id, detail });
    },
  };
  return { store: store as unknown as ShopifySyncStore, calls, states };
}

function withUpdatedAt(name: string, updatedAt: string): ShopifyOrder {
  const o = loadOrder(name) as any;
  o.updatedAt = updatedAt;
  return o;
}

const SKUS = fixtureSkus();

describe('pollOrders', () => {
  it('mode off is a no-op', async () => {
    const { store, calls } = fakeStore('off');
    const r = await pollOrders({
      store,
      fetchOrdersUpdatedSince: async () => {
        throw new Error('must not fetch in off mode');
      },
      loadKnownSkus: async () => SKUS,
    });
    expect(r.fetched).toBe(0);
    expect(calls.config).toHaveLength(0);
  });

  it('shadow mode: gates, plans, persists, advances cursor — no pipeline', async () => {
    const { store, calls } = fakeStore('shadow', '2026-08-17T00:00:00Z');
    const orders = [
      withUpdatedAt('b2b-latest', '2026-08-17T10:00:00Z'),
      withUpdatedAt('multi-tax-domestic', '2026-08-17T11:00:00Z'),
      withUpdatedAt('pos', '2026-08-17T12:00:00Z'), // errors: SKU-less custom item
    ];
    const r = await pollOrders({
      store,
      fetchOrdersUpdatedSince: async (since) => {
        // Overlap window: cursor minus 10 min.
        expect(since).toBe('2026-08-16T23:50:00.000Z');
        return orders;
      },
      loadKnownSkus: async () => SKUS,
    });
    expect(r).toMatchObject({ mode: 'shadow', fetched: 3, proceeded: 2, errored: 1, skipped: 0 });
    expect(r.cursor).toBe('2026-08-17T12:00:00Z');
    expect(calls.config[0].orders_cursor).toBe('2026-08-17T12:00:00Z');
    const planned = calls.events.filter((e) => e.event === 'planned');
    expect(planned).toHaveLength(2);
    const gateErrors = calls.events.filter((e) => e.event === 'gate_error');
    expect(gateErrors).toHaveLength(1);
  });

  it('a skipped (unpaid) order does not poison the run and is recorded', async () => {
    const { store, calls } = fakeStore('shadow');
    const pending = withUpdatedAt('b2c-latest', '2026-08-17T10:00:00Z');
    (pending as any).displayFinancialStatus = 'PENDING';
    const r = await pollOrders({
      store,
      fetchOrdersUpdatedSince: async () => [pending],
      loadKnownSkus: async () => SKUS,
    });
    expect(r).toMatchObject({ fetched: 1, skipped: 1, proceeded: 0, errored: 0 });
    expect(calls.state[0]).toMatchObject({ state: 'skipped', reason: 'UNPAID_YET' });
  });

  it('sandbox mode executes orders and records outcomes; pipeline errors park the order', async () => {
    const { store, calls, states } = fakeStore('sandbox');
    const good = withUpdatedAt('b2c-latest', '2026-08-17T10:00:00Z');
    const bad = withUpdatedAt('b2b-latest', '2026-08-17T11:00:00Z');
    const r = await pollOrders({
      store,
      fetchOrdersUpdatedSince: async () => [good, bad],
      loadKnownSkus: async () => SKUS,
      nsTarget: 'sandbox',
      execute: async (order) => {
        if (order.name === bad.name) {
          const { PipelineError } = await import('@/lib/shopify/engine/pipeline');
          throw new PipelineError({ code: 'UNKNOWN_SKU', message: 'test park' });
        }
        return {
          state: 'paid' as const,
          nsIds: {
            ns_customer_id: '1', ns_so_id: '2', ns_invoice_id: '3',
            ns_payment_ids: ['4'], ns_fulfillment_ids: [], ns_credit_memo_ids: [],
          },
        };
      },
    });
    expect(r).toMatchObject({ executed: 1, errored: 1, proceeded: 2 });
    const goodId = good.id.replace(/^.*\//, '');
    expect(states.get(goodId)).toBe('paid');
    const set = calls.state.find((c: any) => c.id === goodId && c.state === 'paid');
    expect(set.ns_so_id).toBe('2');
    expect(set.ns_target).toBe('sandbox');
  });

  it('live mode skips NetScore-era orders instead of re-booking them (cutover guard)', async () => {
    const { store, states } = fakeStore('live');
    const order = withUpdatedAt('b2c-latest', '2026-08-25T10:00:00Z');
    const orderId = order.id.replace(/^.*\//, '');
    let executed = 0;
    const r = await pollOrders({
      store,
      fetchOrdersUpdatedSince: async () => [order],
      loadKnownSkus: async () => SKUS,
      nsTarget: 'production',
      isNetscoreEra: async (id) => id === orderId,
      execute: async () => {
        executed += 1;
        throw new Error('must not execute a NetScore-era order');
      },
    });
    expect(executed).toBe(0);
    expect(r.skipped).toBe(1);
    expect(states.get(orderId)).toBe('skipped');
  });

  it('sandbox target never consults the NetScore guard (QA re-books deliberately)', async () => {
    const { store } = fakeStore('sandbox');
    const order = withUpdatedAt('b2c-latest', '2026-08-17T10:00:00Z');
    let executed = 0;
    await pollOrders({
      store,
      fetchOrdersUpdatedSince: async () => [order],
      loadKnownSkus: async () => SKUS,
      nsTarget: 'sandbox',
      isNetscoreEra: async () => true,
      execute: async () => {
        executed += 1;
        return {
          state: 'paid' as const,
          nsIds: {
            ns_customer_id: '1', ns_so_id: '2', ns_invoice_id: '3',
            ns_payment_ids: ['4'], ns_fulfillment_ids: [], ns_credit_memo_ids: [],
          },
        };
      },
    });
    expect(executed).toBe(1);
  });

  it('sandbox mode without an executor is a hard error (no silent no-write)', async () => {
    const { store } = fakeStore('sandbox');
    await expect(
      pollOrders({
        store,
        fetchOrdersUpdatedSince: async () => [],
        loadKnownSkus: async () => SKUS,
      }),
    ).rejects.toThrow(/no executor/);
  });

  it('one order throwing does not stop the others', async () => {
    const { store } = fakeStore('shadow');
    const bad = withUpdatedAt('b2b-latest', '2026-08-17T10:00:00Z');
    (bad as any).lineItems = null; // structurally broken payload
    const good = withUpdatedAt('b2c-latest', '2026-08-17T11:00:00Z');
    const r = await pollOrders({
      store,
      fetchOrdersUpdatedSince: async () => [bad, good],
      loadKnownSkus: async () => SKUS,
    });
    expect(r.errored).toBe(1);
    expect(r.proceeded).toBe(1);
    expect(r.cursor).toBe('2026-08-17T11:00:00Z');
  });
});
