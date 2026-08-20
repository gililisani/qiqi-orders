import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../lib/shopify/store';
import { pollOrders } from '../../../../lib/shopify/engine/poll';
import { fetchOrdersUpdatedSince, loadKnownSkus } from '../../../../lib/shopify/engine/deps';
import { executeOrder } from '../../../../lib/shopify/engine/execute';
import { engineConfigForTarget } from '../../../../lib/shopify/engine/config';
import { createNetSuiteForTarget, type NsTarget } from '../../../../lib/shopify/engine/nsTarget';
import { maybeSendErrorDigest, maybeSendPollFailure } from '../../../../lib/shopify/alerts';

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
    const mode = (await store.getConfig()).mode;
    const nsTarget: NsTarget | undefined =
      mode === 'sandbox' ? 'sandbox' : mode === 'live' ? 'production' : undefined;
    const ns = nsTarget ? createNetSuiteForTarget(nsTarget) : null;
    const aliases = await store.getSkuAliases();
    const result = await pollOrders({
      store,
      fetchOrdersUpdatedSince,
      loadKnownSkus: async () => {
        const skus = await loadKnownSkus();
        for (const sku of aliases.keys()) skus.add(sku);
        return skus;
      },
      nsTarget,
      execute: ns
        ? (order, plan) =>
            executeOrder(order, plan, ns, engineConfigForTarget(nsTarget!), {
              skuOverrides: aliases,
              stampCandidates: (sid) => store.stampCandidates(sid, nsTarget!),
            })
        : undefined,
    });
    console.log(`[cron/shopify-poll] ${JSON.stringify(result)}`);

    // Daily digest when errors exist (throttled inside).
    const db = createServiceRoleClient();
    const { data: parked } = await db
      .from('shopify_order_sync')
      .select('order_name, error_code, error_message')
      .eq('state', 'error')
      .limit(50);
    if (parked?.length) await maybeSendErrorDigest(store, parked);

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    const message = String(err?.message ?? err).slice(0, 1000);
    console.error('[cron/shopify-poll] error:', message);
    try {
      await store.updateConfig({ last_poll_error: message });
      await store.event('system', 'poll_failed', null, { error: message });
      await maybeSendPollFailure(store, message);
    } catch {
      // reporting must not mask the original failure
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
