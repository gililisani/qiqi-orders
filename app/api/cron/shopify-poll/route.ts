import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../lib/shopify/store';
import { pollOrders } from '../../../../lib/shopify/engine/poll';
import { fetchOrdersUpdatedSince, loadKnownSkus } from '../../../../lib/shopify/engine/deps';

/**
 * Loop A poller (every 15 min, vercel.json). Mode lives in
 * shopify_sync_config: 'off' = no-op, 'shadow' = compute + persist, no NS
 * writes, 'sandbox'/'live' = full pipeline (Phase 2b).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.SHOPIFY_CLIENT_ID && !process.env.SHOPIFY_ADMIN_TOKEN) {
    // Staging has no Shopify app on purpose — succeed quietly.
    return NextResponse.json({ success: true, skipped: 'Shopify not configured' });
  }

  const store = new ShopifySyncStore(createServiceRoleClient());
  try {
    const result = await pollOrders({ store, fetchOrdersUpdatedSince, loadKnownSkus });
    console.log(`[cron/shopify-poll] ${JSON.stringify(result)}`);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    const message = String(err?.message ?? err).slice(0, 1000);
    console.error('[cron/shopify-poll] error:', message);
    try {
      await store.updateConfig({ last_poll_error: message });
      await store.event('system', 'poll_failed', null, { error: message });
    } catch {
      // reporting must not mask the original failure
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
