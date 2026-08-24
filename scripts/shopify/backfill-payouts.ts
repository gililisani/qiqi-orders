/**
 * Loop E backfill: book recent Shopify Payments payouts as fee bill +
 * payment + net journal. Default target SANDBOX (staging Supabase);
 * production requires BOTH flags and persists to the prod dashboard:
 *
 *   npx tsx scripts/shopify/backfill-payouts.ts --count 6
 *   npx tsx scripts/shopify/backfill-payouts.ts --count 2 --target production --i-am-sure
 *
 * Idempotent: SHOPPO-FEE-/SHOPPO-NET- externalids adopt on re-run.
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { ShopifySyncStore } from '../../lib/shopify/store';
import { bookRecentPayouts } from '../../lib/shopify/engine/payoutRun';
import { engineConfigForTarget } from '../../lib/shopify/engine/config';
import { createNetSuiteForTarget, type NsTarget } from '../../lib/shopify/engine/nsTarget';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const count = Number(arg('count') ?? '6');
  const target: NsTarget = arg('target') === 'production' ? 'production' : 'sandbox';
  if (target === 'production' && !has('i-am-sure')) {
    throw new Error('--target production writes to the PRODUCTION ledger — add --i-am-sure to confirm');
  }
  const config = engineConfigForTarget(target);

  console.log(`booking up to ${count} recent paid payouts → NS ${target.toUpperCase()}`);
  // Production persists to the prod HUB Supabase (dashboard visibility);
  // sandbox runs persist to staging when its keys are present.
  const store =
    target === 'production'
      ? new ShopifySyncStore(
          createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
            auth: { persistSession: false },
          }),
        )
      : process.env.STAGING_SUPABASE_URL && process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY
        ? new ShopifySyncStore(
            createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
              auth: { persistSession: false },
            }),
          )
        : null;
  const ns = createNetSuiteForTarget(target);
  const result = await bookRecentPayouts({ count, ns, config, store, nsTarget: target, log: (l) => console.log(`  ${l}`) });
  console.log(`\nDONE: ${result.booked.length} booked, ${result.errored.length} errored`);
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
