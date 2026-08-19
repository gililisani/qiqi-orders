/**
 * Loop E backfill (SANDBOX): book recent Shopify Payments payouts as
 * fee bill + payment + net journal.
 *
 *   npx tsx scripts/shopify/backfill-payouts.ts --count 6
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { fetchRecentPayouts } from '../../lib/shopify/payoutFetch';
import { ensurePayoutBooking } from '../../lib/shopify/engine/payouts';
import { PipelineError } from '../../lib/shopify/engine/pipeline';
import { ENGINE_CONFIG } from '../../lib/shopify/engine/config';
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const count = Number(arg('count') ?? '6');
  const payouts = await fetchRecentPayouts({ count });
  console.log(`fetched ${payouts.length} paid payouts`);
  const ns = createNetSuiteForTarget('sandbox');
  let ok = 0, errored = 0;

  for (const { payout, txns } of payouts) {
    try {
      const r = await ensurePayoutBooking(payout, txns, ns, ENGINE_CONFIG);
      ok += 1;
      const c = r.created;
      console.log(
        `  ✓ payout ${r.plan.shopifyPayoutId} (${r.plan.issuedAt.slice(0, 10)}) net=$${(r.plan.netCents / 100).toFixed(2)} ` +
          `fees=$${(r.plan.totalFeeCents / 100).toFixed(2)} → bill=${r.nsFeeBillId ?? '-'}${c.bill ? '(new)' : ''} ` +
          `pay=${r.nsFeePaymentId ?? '-'}${c.payment ? '(new)' : ''} journal=${r.nsJournalId}${c.journal ? '(new)' : ''}`,
      );
    } catch (err: any) {
      errored += 1;
      const msg = err instanceof PipelineError ? `${err.issue.code}: ${err.issue.message}` : String(err?.message ?? err);
      console.log(`  ✗ payout ${payout.legacyResourceId}: ${msg.slice(0, 220)}`);
    }
  }
  console.log(`\nDONE: ${ok} booked, ${errored} errored of ${payouts.length}`);
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
