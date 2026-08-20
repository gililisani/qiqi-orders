/**
 * Persistent poll: real Shopify → NS SANDBOX writes, state persisted to
 * the STAGING Supabase (what the /admin/shopify dashboard reads).
 * Mode comes from shopify_sync_config in staging (must be 'sandbox').
 *
 *   npx tsx scripts/shopify/run-poll-staging.ts [--set-mode sandbox]
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

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const db = createClient(process.env.STAGING_SUPABASE_URL!, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const store = new ShopifySyncStore(db);

  const setMode = arg('set-mode');
  if (setMode) {
    await store.updateConfig({ mode: setMode as any });
    console.log(`mode set to ${setMode}`);
  }
  const config = await store.getConfig();
  console.log(`mode=${config.mode} cursor=${config.orders_cursor}`);
  if (config.mode === 'off') {
    console.log('mode is off — nothing to do (use --set-mode sandbox)');
    return;
  }

  const nsTarget = config.mode === 'live' ? ('production' as const) : ('sandbox' as const);
  const ns = config.mode === 'sandbox' || config.mode === 'live' ? createNetSuiteForTarget(nsTarget) : null;
  const result = await pollOrders({
    store,
    fetchOrdersUpdatedSince,
    loadKnownSkus,
    nsTarget,
    execute: ns ? (order, plan) => executeOrder(order, plan, ns, engineConfigForTarget(nsTarget)) : undefined,
  });
  console.log('RESULT:', JSON.stringify(result));
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
