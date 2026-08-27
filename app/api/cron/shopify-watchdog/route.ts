import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../lib/shopify/store';
import { maybeSendPollFailure } from '../../../../lib/shopify/alerts';

/**
 * Dead-man's switch (every 30 min, vercel.json). The 2026-08-26 wedge
 * proved error-based alerting misses SILENT death: the poller was down
 * 10h without a mail. Two heartbeats, because they fail differently:
 * - last_poll_at stale (> 45 min): polls aren't running at all (cron not
 *   firing, hang, bad deploy).
 * - last poll_complete EVENT stale (> 45 min): polls are starting but
 *   dying mid-run — the 2026-08-27 mode, where 60s runtime kills left the
 *   incremental checkpoints refreshing last_poll_at while no cycle ever
 *   finished, and this watchdog stayed silent for hours.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = createServiceRoleClient();
  const store = new ShopifySyncStore(db);
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

    const { data: lastComplete } = await db
      .from('shopify_sync_events')
      .select('created_at')
      .eq('loop', 'system')
      .eq('event', 'poll_complete')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const completeMs = lastComplete?.created_at ? new Date(lastComplete.created_at).getTime() : 0;
    const staleCompleteMin = Math.round((Date.now() - completeMs) / 60_000);
    if (staleCompleteMin > 45) {
      await maybeSendPollFailure(
        store,
        `WATCHDOG: polls are STARTING but not FINISHING — no poll_complete event in ${staleCompleteMin} minutes (last at ${lastComplete?.created_at ?? 'never'}) while last_poll_at is fresh. Runs are dying mid-batch; check the Vercel function logs for /api/cron/shopify-poll for timeouts or crashes.`,
      );
      return NextResponse.json({ success: true, stale: true, staleCompleteMin });
    }
    return NextResponse.json({ success: true, stale: false, staleMin, staleCompleteMin });
  } catch (err: any) {
    const message = String(err?.message ?? err).slice(0, 500);
    console.error('[cron/shopify-watchdog] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
