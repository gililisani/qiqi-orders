/**
 * Live shadow poll, locally: real Shopify orders (last 24h), real NS SKU
 * universe (read-only SuiteQL), full gate + transform — with an in-memory
 * store, so NOTHING is written anywhere. Prints what a real poll would do.
 *
 *   npx tsx scripts/shopify/shadow-poll-local.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { pollOrders } from '../../lib/shopify/engine/poll';
import { fetchOrdersUpdatedSince, loadKnownSkus } from '../../lib/shopify/engine/deps';
import type { ShopifySyncStore } from '../../lib/shopify/store';

function memoryStore() {
  const rows = new Map<string, any>();
  const events: any[] = [];
  const store = {
    async getConfig() {
      return { mode: 'shadow', orders_cursor: null, fulfillments_cursor: null, payouts_cursor: null, last_poll_at: null, last_poll_error: null };
    },
    async updateConfig() {},
    async seenOrder(order: any, plan: any) {
      rows.set(order.name, { plan, state: 'seen' });
    },
    async setState(id: string, state: string, fields: any = {}) {
      for (const [, v] of rows) if (v.id === id) Object.assign(v, { state, ...fields });
    },
    async markSkipped(id: string, reason: string, message: string) {
      events.push({ event: 'skip', id, reason, message });
    },
    async markError(id: string, issues: any[]) {
      events.push({ event: 'error', id, issues });
    },
    async getOrderState() {
      return null;
    },
    async event(loop: string, event: string, id: string | null, detail: any) {
      events.push({ loop, event, id, detail });
    },
  };
  return { store: store as unknown as ShopifySyncStore, rows, events };
}

async function main() {
  const { store, rows, events } = memoryStore();
  const result = await pollOrders({ store, fetchOrdersUpdatedSince, loadKnownSkus });
  console.log('RESULT:', JSON.stringify(result));
  for (const e of events.filter((e) => e.event === 'skip' || e.event === 'error' || e.event === 'gate_error')) {
    console.log('ISSUE:', JSON.stringify(e).slice(0, 400));
  }
  for (const [name, row] of rows) {
    const p = row.plan;
    if (!p) {
      console.log(`ORDER ${name}: (no plan — skipped/errored)`);
      continue;
    }
    console.log(
      `ORDER ${name}: ${p.buyer.kind} "${p.buyer.displayName}" total=$${(p.totals.totalCents / 100).toFixed(2)} ` +
        `lines=${p.lines.length} tax=${p.taxLines.length} payments=${p.payments.map((x: any) => `${x.gateway}:$${(x.amountCents / 100).toFixed(2)}`).join('+')}`,
    );
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
