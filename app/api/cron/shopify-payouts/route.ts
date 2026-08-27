import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../lib/shopify/store';
import { bookRecentPayouts } from '../../../../lib/shopify/engine/payoutRun';
import { bookGatewayEntries } from '../../../../lib/shopify/engine/gatewayRun';
import { engineConfigForTarget } from '../../../../lib/shopify/engine/config';
import { createNetSuiteForTarget, type NsTarget } from '../../../../lib/shopify/engine/nsTarget';
import { maybeSendPollFailure } from '../../../../lib/shopify/alerts';

/**
 * Loop E + Phase B — daily payout & gateway booking (14:00 UTC ≈ 10:00 ET, after
 * Shopify flips the morning payouts to PAID). Idempotent: SHOPPO-*
 * externalids adopt, so the daily run books new payouts and re-adopts the
 * rest. count=6 covers several weeks of Mondays + odd mid-week payouts.
 * A payout that cannot book (e.g., dispute without a chargeback account)
 * lands as an error row on the dashboard + a throttled alert email.
 */
// vercel.json's functions block is not honored for Next.js routes — without
// this export the runtime caps the function at 60s (proven on the poll and
// reconcile crons 2026-08-27); Phase A + Phase B need the full window.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.SHOPIFY_CLIENT_ID && !process.env.SHOPIFY_ADMIN_TOKEN) {
    return NextResponse.json({ success: true, skipped: 'Shopify not configured' });
  }
  const store = new ShopifySyncStore(createServiceRoleClient());
  try {
    const mode = (await store.getConfig()).mode;
    if (mode !== 'live') {
      return NextResponse.json({ success: true, skipped: `mode is '${mode}'` });
    }
    const nsTarget: NsTarget = 'production';
    const result = await bookRecentPayouts({
      count: 6,
      ns: createNetSuiteForTarget(nsTarget),
      config: engineConfigForTarget(nsTarget),
      store,
      nsTarget,
      log: (l) => console.log(`[cron/shopify-payouts] ${l}`),
    });
    if (result.errored.length > 0) {
      await maybeSendPollFailure(
        store,
        `payout booking: ${result.errored.map((e) => `${e.payoutId}: ${e.error}`).join(' | ').slice(0, 900)}`,
      );
    }

    // Phase B — PayPal/Affirm fee+transfer booking, strictly AFTER the
    // Shopify payout run (same function, sequential: cannot cross another
    // NS job by construction; owner requirement 2026-08-24).
    const gateways = await bookGatewayEntries({
      ns: createNetSuiteForTarget(nsTarget),
      apply: true,
      log: (l) => console.log(`[cron/shopify-payouts] ${l}`),
    });
    if (gateways.errors.length > 0) {
      await maybeSendPollFailure(store, `gateway booking: ${gateways.errors.join(' | ').slice(0, 900)}`);
    }
    return NextResponse.json({ success: true, booked: result.booked, errored: result.errored, gateways });
  } catch (err: any) {
    const message = String(err?.message ?? err).slice(0, 1000);
    console.error('[cron/shopify-payouts] error:', message);
    try {
      await store.event('payouts', 'cron_failed', null, { error: message });
      await maybeSendPollFailure(store, `payout cron failed: ${message}`);
    } catch {
      // reporting must not mask the original failure
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
