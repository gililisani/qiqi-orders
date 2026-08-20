/**
 * Loop D manual runner — reconcile any window of Shopify orders against
 * NS + the sync state, exactly like the nightly cron (writes error cards
 * to the target's Supabase). For historical sweeps and cutover checks.
 *
 *   npx tsx scripts/shopify/reconcile.ts --from 2026-08-10 --to 2026-08-12                  # sandbox + staging DB
 *   npx tsx scripts/shopify/reconcile.ts --from 2026-08-25 --to 2026-08-26 --target production
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { ShopifySyncStore } from '../../lib/shopify/store';
import { reconcileOrders } from '../../lib/shopify/engine/reconcile';
import { fetchOrdersCreatedBetween, loadKnownSkus } from '../../lib/shopify/engine/deps';
import { engineConfigForTarget } from '../../lib/shopify/engine/config';
import { createNetSuiteForTarget, type NsTarget } from '../../lib/shopify/engine/nsTarget';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}

async function main() {
  const from = arg('from');
  const to = arg('to');
  if (!from || !to) throw new Error('Usage: reconcile.ts --from YYYY-MM-DD --to YYYY-MM-DD [--target production]');
  const target: NsTarget = arg('target') === 'production' ? 'production' : 'sandbox';

  // Sandbox recon persists to the staging Supabase (where sandbox QA
  // state lives); production recon to the prod HUB Supabase.
  const db =
    target === 'production'
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false },
        })
      : createClient(process.env.STAGING_SUPABASE_URL!, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false },
        });
  const store = new ShopifySyncStore(db);

  console.log(`Reconcile ${from} → ${to} against NS ${target.toUpperCase()}`);
  const result = await reconcileOrders({
    store,
    ns: createNetSuiteForTarget(target),
    config: engineConfigForTarget(target),
    nsTarget: target,
    fetchOrdersCreatedBetween,
    loadKnownSkus,
    window: { fromIso: `${from}T00:00:00Z`, toIso: `${to}T23:59:59Z` },
  });

  console.log(`\nfetched=${result.fetched} checked=${result.checked} clean=${result.clean}`);
  console.log(`netscore-era=${result.netscoreEra} skipped/ignored=${result.skippedOrIgnored} already-error=${result.alreadyError}`);
  if (result.flagged.length === 0) {
    console.log('ALL CLEAN');
  } else {
    console.log(`FLAGGED ${result.flagged.length}:`);
    for (const f of result.flagged) console.log(`  ✗ ${f.order} [${f.code}] ${f.message}`);
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
