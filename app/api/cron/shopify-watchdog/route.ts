import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../lib/shopify/store';
import { maybeSendPollFailure } from '../../../../lib/shopify/alerts';

/**
 * Dead-man's switch (every 30 min, vercel.json). The 2026-08-26 wedge
 * proved error-based alerting misses SILENT death: the poller was down
 * 10h without a mail. This checks the heartbeat itself — regardless of
 * failure mode (hang, crash, cron not firing, bad deploy), a stale
 * last_poll_at (> 45 min in live mode) alerts within the half hour.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const store = new ShopifySyncStore(createServiceRoleClient());
  try {
    const config = await store.getConfig();
    if (config.mode !== 'live') return NextResponse.json({ success: true, skipped: `mode is '${config.mode}'` });
    const last = config.last_poll_at ? new Date(config.last_poll_at).getTime() : 0;
    const staleMin = Math.round((Date.now() - last) / 60_000);
    if (staleMin > 45) {
      await maybeSendPollFailure(
        store,
        `WATCHDOG: the order poller has not completed a cycle in ${staleMin} minutes (last_poll_at ${config.last_poll_at ?? 'never'}). It should run every 15. Check the Vercel function logs for /api/cron/shopify-poll and the sync events table.`,
      );
      return NextResponse.json({ success: true, stale: true, staleMin });
    }
    return NextResponse.json({ success: true, stale: false, staleMin });
  } catch (err: any) {
    const message = String(err?.message ?? err).slice(0, 500);
    console.error('[cron/shopify-watchdog] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
