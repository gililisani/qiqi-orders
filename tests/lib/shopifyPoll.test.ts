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
