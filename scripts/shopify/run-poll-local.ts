/**
 * Full poll cycle, locally, mode=sandbox: real Shopify orders (last 24h),
 * real NS sandbox writes via the A→B→C executor, in-memory state store.
 *
 *   npx tsx scripts/shopify/run-poll-local.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { pollOrders } from '../../lib/shopify/engine/poll';
import { fetchOrdersUpdatedSince, loadKnownSkus } from '../../lib/shopify/engine/deps';
import { executeOrder } from '../../lib/shopify/engine/execute';
import { ENGINE_CONFIG } from '../../lib/shopify/engine/config';
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';
import type { ShopifySyncStore } from '../../lib/shopify/store';

function memoryStore() {
  const rows = new Map<string, any>();
  const store = {
    async getConfig() {
      return { mode: 'sandbox', orders_cursor: new Date(Date.now() - 3 * 3600_000).toISOString(), fulfillments_cursor: null, payouts_cursor: null, last_poll_at: null, last_poll_error: null };
    },
    async updateConfig() {},
    async seenOrder(order: any, plan: any) {
      rows.set(order.id.replace(/^.*\//, ''), { name: order.name, plan });
    },
    async setState(id: string, state: string, fields: any = {}) {
      Object.assign(rows.get(id) ?? {}, { state, fields });
    },
    async markSkipped(id: string, reason: string) {
      rows.set(id, { ...(rows.get(id) ?? {}), state: 'skipped', reason });
    },
    async markError(id: string, issues: any[]) {
      rows.set(id, { ...(rows.get(id) ?? {}), state: 'error', issues });
    },
    async getOrderState() { return null; },
    async event() {},
  };
  return { store: store as unknown as ShopifySyncStore, rows };
}

async function main() {
  const { store, rows } = memoryStore();
  const ns = createNetSuiteForTarget('sandbox');
  const result = await pollOrders({
    store,
    fetchOrdersUpdatedSince,
    loadKnownSkus,
    nsTarget: 'sandbox',
    execute: (order, plan) => executeOrder(order, plan, ns, ENGINE_CONFIG),
  });
  console.log('RESULT:', JSON.stringify(result));
  for (const [, row] of rows) {
    if (row.state === 'error') {
      console.log(`  ✗ ${row.name}: ${JSON.stringify(row.issues).slice(0, 180)}`);
    } else if (row.state === 'skipped') {
      console.log(`  - ${row.name}: skipped (${row.reason})`);
    } else if (row.state) {
      const f = row.fields ?? {};
      console.log(
        `  ✓ ${row.name}: ${row.state} so=${f.ns_so_id} inv=${f.ns_invoice_id} ` +
          `pay=${(f.ns_payment_ids ?? []).length} if=${(f.ns_fulfillment_ids ?? []).length} cm=${(f.ns_credit_memo_ids ?? []).length}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
