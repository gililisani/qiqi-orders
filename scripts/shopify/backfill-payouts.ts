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
import { fetchRecentPayouts } from '../../lib/shopify/payoutFetch';
import { ensurePayoutBooking } from '../../lib/shopify/engine/payouts';
import { PipelineError } from '../../lib/shopify/engine/pipeline';
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

  const payouts = await fetchRecentPayouts({ count });
  console.log(`fetched ${payouts.length} paid payouts → NS ${target.toUpperCase()}`);
  const ns = createNetSuiteForTarget(target);
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
  let ok = 0, errored = 0;

  for (const { payout, txns } of payouts) {
    try {
      const r = await ensurePayoutBooking(payout, txns, ns, config);
      ok += 1;
      const c = r.created;
      console.log(
        `  ✓ payout ${r.plan.shopifyPayoutId} (${r.plan.issuedAt.slice(0, 10)}) net=$${(r.plan.netCents / 100).toFixed(2)} ` +
          `fees=$${(r.plan.totalFeeCents / 100).toFixed(2)} → bill=${r.nsFeeBillId ?? '-'}${c.bill ? '(new)' : ''} ` +
          `pay=${r.nsFeePaymentId ?? '-'}${c.payment ? '(new)' : ''} journal=${r.nsJournalId}${c.journal ? '(new)' : ''}`,
      );
      await store?.upsertPayout({
        shopify_payout_id: r.plan.shopifyPayoutId,
        issued_at: r.plan.issuedAt.slice(0, 10),
        status: r.plan.status,
        net_cents: r.plan.netCents,
        fee_cents: r.plan.totalFeeCents,
        state: 'booked',
        ns_target: target,
        ns_fee_bill_id: r.nsFeeBillId,
        ns_fee_payment_id: r.nsFeePaymentId,
        ns_journal_id: r.nsJournalId,
        composition: { breakdown: r.plan.breakdown, disputes: r.plan.disputes } as any,
        error_message: null,
      });
    } catch (err: any) {
      errored += 1;
      const msg = err instanceof PipelineError ? `${err.issue.code}: ${err.issue.message}` : String(err?.message ?? err);
      console.log(`  ✗ payout ${payout.legacyResourceId}: ${msg.slice(0, 220)}`);
      await store?.upsertPayout({
        shopify_payout_id: payout.legacyResourceId,
        issued_at: payout.issuedAt.slice(0, 10),
        status: payout.status,
        net_cents: Math.round(Number(payout.net.amount) * 100),
        fee_cents: 0,
        state: 'error',
        ns_target: target,
        error_message: msg.slice(0, 500),
      });
    }
  }
  console.log(`\nDONE: ${ok} booked, ${errored} errored of ${payouts.length}`);
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
