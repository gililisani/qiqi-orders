import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../lib/shopify/store';
import { reconcileOrders } from '../../../../lib/shopify/engine/reconcile';
import { fetchOrdersCreatedBetween, loadKnownSkus } from '../../../../lib/shopify/engine/deps';
import { engineConfigForTarget } from '../../../../lib/shopify/engine/config';
import { createNetSuiteForTarget, type NsTarget } from '../../../../lib/shopify/engine/nsTarget';
import { maybeSendErrorDigest } from '../../../../lib/shopify/alerts';

/**
 * Loop D — nightly reconciliation (vercel.json, 08:10 UTC ≈ 04:10 ET,
 * after the New York business day closes). Re-verifies the last 48h of
 * orders against NS to the cent; misses/mismatches become error-queue
 * cards. No-op unless mode is sandbox/live (recon needs an NS target).
 */
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
    if (mode !== 'sandbox' && mode !== 'live') {
      return NextResponse.json({ success: true, skipped: `mode is '${mode}'` });
    }
    const nsTarget: NsTarget = mode === 'live' ? 'production' : 'sandbox';

    const result = await reconcileOrders({
      store,
      ns: createNetSuiteForTarget(nsTarget),
      config: engineConfigForTarget(nsTarget),
      nsTarget,
      fetchOrdersCreatedBetween,
      loadKnownSkus,
    });
    console.log(`[cron/shopify-reconcile] ${JSON.stringify(result)}`);

    if (result.flagged.length > 0) {
      const db = createServiceRoleClient();
      const { data: parked } = await db
        .from('shopify_order_sync')
        .select('order_name, error_code, error_message')
        .eq('state', 'error')
        .limit(50);
      if (parked?.length) await maybeSendErrorDigest(store, parked);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    const message = String(err?.message ?? err).slice(0, 1000);
    console.error('[cron/shopify-reconcile] error:', message);
    try {
      await store.event('system', 'recon_failed', null, { error: message });
    } catch {
      // reporting must not mask the original failure
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
