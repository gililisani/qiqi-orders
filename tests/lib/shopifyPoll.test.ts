import { describe, expect, it } from 'vitest';
import { pollOrders } from '@/lib/shopify/engine/poll';
import type { ShopifySyncStore } from '@/lib/shopify/store';
import type { ShopifyOrder } from '@/lib/shopify/core/types';
import { fixtureSkus, loadOrder } from '../helpers/shopifyFixtures';

/** In-memory stand-in for ShopifySyncStore, recording everything. */
function fakeStore(mode: string, cursor: string | null = null, seedRows: Record<string, any> = {}) {
  const calls: Record<string, any[]> = { seen: [], state: [], events: [], config: [] };
  const states = new Map<string, string>();
  const rows = new Map<string, any>(Object.entries(seedRows));
  for (const [id, row] of rows) states.set(id, row.state);
  const store = {
    async getConfig() {
      return { mode, orders_cursor: cursor, fulfillments_cursor: null, payouts_cursor: null, last_poll_at: null, last_poll_error: null };
    },
    async updateConfig(patch: any) {
      calls.config.push(patch);
    },
    async seenOrder(order: ShopifyOrder, plan: any) {
      calls.seen.push({ name: order.name, hasPlan: !!plan });
      const id = order.id.replace(/^.*\//, '');
      rows.set(id, { ...(rows.get(id) ?? { state: 'pending' }), shopify_updated_at: (order as any).updatedAt ?? null });
    },
    async setState(id: string, state: string, fields: any = {}) {
      states.set(id, state);
      rows.set(id, { ...(rows.get(id) ?? {}), state, ...fields });
      calls.state.push({ id, state, ...fields });
    },
    async markSkipped(id: string, reason: string) {
      states.set(id, 'skipped');
      rows.set(id, { ...(rows.get(id) ?? {}), state: 'skipped' });
      calls.state.push({ id, state: 'skipped', reason });
    },
    async markError(id: string, issues: any[]) {
      states.set(id, 'error');
      rows.set(id, { ...(rows.get(id) ?? {}), state: 'error' });
      calls.state.push({ id, state: 'error', issues });
    },
    async getOrderState(id: string) {
      const r = rows.get(id);
      return r
        ? {
            state: r.state,
            retry_count: 0,
            shopify_updated_at: r.shopify_updated_at ?? null,
            executed_shopify_updated_at: r.executed_shopify_updated_at ?? null,
          }
        : null;
    },
    async event(loop: string, event: string, id: string | null, detail: any) {
      calls.events.push({ loop, event, id, detail });
    },
  };
  return { store: store as unknown as ShopifySyncStore, calls, states, rows };
}

const PAID_OUTCOME = {
  state: 'paid' as const,
  nsIds: {
    ns_customer_id: '1', ns_so_id: '2', ns_invoice_id: '3',
    ns_payment_ids: ['4'], ns_fulfillment_ids: [], ns_credit_memo_ids: [],
  },
};

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
        // Overlap window: cursor minus 30 min (widened after the 2026-08-26 wedge).
        expect(since).toBe('2026-08-16T23:30:00.000Z');
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

  it('successful execution stamps the executed watermark alongside the state', async () => {
    const { store, calls } = fakeStore('live');
    const order = withUpdatedAt('b2c-latest', '2026-08-27T10:00:00Z');
    await pollOrders({
      store,
      fetchOrdersUpdatedSince: async () => [order],
      loadKnownSkus: async () => SKUS,
      nsTarget: 'production',
      execute: async () => PAID_OUTCOME,
    });
    const set = calls.state.find((c: any) => c.state === 'paid');
    expect(set.executed_shopify_updated_at).toBe('2026-08-27T10:00:00Z');
  });

  it('re-seen order with a covered watermark does NO work but still advances the cursor', async () => {
    const order = withUpdatedAt('b2c-latest', '2026-08-27T10:00:00Z');
    const orderId = order.id.replace(/^.*\//, '');
    // Watermark stored in Postgres format ('+00:00'), fetched in Shopify
    // format ('Z') — must compare as time, not strings.
    const { store, calls } = fakeStore('live', '2026-08-27T09:00:00Z', {
      [orderId]: {
        state: 'paid',
        shopify_updated_at: '2026-08-27T10:00:00+00:00',
        executed_shopify_updated_at: '2026-08-27T10:00:00+00:00',
      },
    });
    let executed = 0;
    const r = await pollOrders({
      store,
      fetchOrdersUpdatedSince: async () => [order],
      loadKnownSkus: async () => SKUS,
      nsTarget: 'production',
      execute: async () => {
        executed += 1;
        return PAID_OUTCOME;
      },
    });
    expect(executed).toBe(0);
    expect(r.unchanged).toBe(1);
    expect(r.cursor).toBe('2026-08-27T10:00:00Z');
    expect(calls.seen).toHaveLength(0);
    expect(calls.state).toHaveLength(0);
  });

  it('a fresher update re-executes despite a completed earlier run (stale watermark)', async () => {
    const order = withUpdatedAt('b2c-latest', '2026-08-27T11:00:00Z');
    const orderId = order.id.replace(/^.*\//, '');
    const { store, calls } = fakeStore('live', null, {
      [orderId]: {
        state: 'paid',
        shopify_updated_at: '2026-08-27T11:00:00+00:00', // seenOrder ran, then the run was killed mid-execute
        executed_shopify_updated_at: '2026-08-27T10:00:00+00:00',
      },
    });
    let executed = 0;
    const r = await pollOrders({
      store,
      fetchOrdersUpdatedSince: async () => [order],
      loadKnownSkus: async () => SKUS,
      nsTarget: 'production',
      execute: async () => {
        executed += 1;
        return PAID_OUTCOME;
      },
    });
    expect(executed).toBe(1);
    expect(r.unchanged).toBe(0);
    const set = calls.state.find((c: any) => c.state === 'paid');
    expect(set.executed_shopify_updated_at).toBe('2026-08-27T11:00:00Z');
  });

  it('admin-ignored orders are never auto-executed, even when updated', async () => {
    const order = withUpdatedAt('b2c-latest', '2026-08-27T12:00:00Z');
    const orderId = order.id.replace(/^.*\//, '');
    const { store } = fakeStore('live', null, {
      [orderId]: { state: 'ignored', shopify_updated_at: '2026-08-27T10:00:00+00:00' },
    });
    let executed = 0;
    const r = await pollOrders({
      store,
      fetchOrdersUpdatedSince: async () => [order],
      loadKnownSkus: async () => SKUS,
      nsTarget: 'production',
      execute: async () => {
        executed += 1;
        return PAID_OUTCOME;
      },
    });
    expect(executed).toBe(0);
    expect(r.unchanged).toBe(1);
  });

  it('unchanged skipped orders are not re-marked every cycle', async () => {
    const order = withUpdatedAt('b2c-latest', '2026-08-27T10:00:00Z');
    (order as any).displayFinancialStatus = 'PENDING';
    const orderId = order.id.replace(/^.*\//, '');
    const { store, calls } = fakeStore('live', null, {
      [orderId]: { state: 'skipped', shopify_updated_at: '2026-08-27T10:00:00+00:00' },
    });
    const r = await pollOrders({
      store,
      fetchOrdersUpdatedSince: async () => [order],
      loadKnownSkus: async () => SKUS,
      nsTarget: 'production',
      execute: async () => PAID_OUTCOME,
    });
    expect(r.unchanged).toBe(1);
    expect(calls.state).toHaveLength(0);
    expect(calls.events.filter((e) => e.event === 'gate_skip')).toHaveLength(0);
  });

  it('shadow mode ignores the watermark and still recomputes plans', async () => {
    const order = withUpdatedAt('b2c-latest', '2026-08-27T10:00:00Z');
    const orderId = order.id.replace(/^.*\//, '');
    const { store, calls } = fakeStore('shadow', null, {
      [orderId]: {
        state: 'paid',
        shopify_updated_at: '2026-08-27T10:00:00+00:00',
        executed_shopify_updated_at: '2026-08-27T10:00:00+00:00',
      },
    });
    const r = await pollOrders({
      store,
      fetchOrdersUpdatedSince: async () => [order],
      loadKnownSkus: async () => SKUS,
    });
    expect(r.unchanged).toBe(0);
    expect(calls.events.filter((e) => e.event === 'planned')).toHaveLength(1);
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
