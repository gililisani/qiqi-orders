/**
 * The production poll cycle, run locally with full visibility — the same
 * wiring as /api/cron/shopify-poll (prod Supabase store, live mode,
 * production NetSuite). Idempotent like every poll. Built during the
 * 2026-08-26 wedge to observe the poller synchronously.
 *   NODE_PATH=$PWD/node_modules npx tsx scripts/shopify/run-poll-prod.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';
import { ShopifySyncStore } from '../../lib/shopify/store';
import { pollOrders } from '../../lib/shopify/engine/poll';
import { fetchOrdersUpdatedSince, loadKnownSkus } from '../../lib/shopify/engine/deps';
import { executeOrder } from '../../lib/shopify/engine/execute';
import { engineConfigForTarget } from '../../lib/shopify/engine/config';
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const t0 = Date.now();
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const store = new ShopifySyncStore(db);
  const mode = (await store.getConfig()).mode;
  if (mode !== 'live') throw new Error(`mode is '${mode}', expected live`);
  const ns = createNetSuiteForTarget('production');
  const aliases = await store.getSkuAliases();
  const result = await pollOrders({
    store,
    fetchOrdersUpdatedSince: async (since) => {
      console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] fetching orders updated since ${since}`);
      const orders = await fetchOrdersUpdatedSince(since);
      console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] fetched ${orders.length}: ${orders.map((o: any) => o.name).join(' ')}`);
      return orders;
    },
    loadKnownSkus: async () => {
      const skus = await loadKnownSkus();
      for (const sku of aliases.keys()) skus.add(sku);
      console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] SKU universe ${skus.size}`);
      return skus;
    },
    nsTarget: 'production',
    isNetscoreEra: (orderId) => store.hasNetscoreSalesOrder(orderId),
    execute: async (order, plan) => {
      console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] executing ${order.name}…`);
      const outcome = await executeOrder(order, plan, ns, engineConfigForTarget('production'), {
        skuOverrides: aliases,
        stampCandidates: (sid) => store.stampCandidates(sid, 'production'),
      });
      console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]   → ${order.name} ${outcome.state} so=${outcome.nsIds.ns_so_id} ifs=${outcome.nsIds.ns_fulfillment_ids.length}`);
      return outcome;
    },
  });
  console.log(`\nDONE in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${JSON.stringify(result)}`);
}
main().catch((e) => { console.error('POLL FAILED:', String(e?.message ?? e).slice(0, 600)); console.error(e?.stack?.split('\n').slice(0, 6).join('\n')); process.exit(1); });
