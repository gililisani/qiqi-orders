import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../../lib/shopify/store';
import { shopifyGraphQL } from '../../../../../lib/shopify/client';
import { ORDER_SELECTION } from '../../../../../lib/shopify/orderQuery';
import { gateOrder } from '../../../../../lib/shopify/core/validate';
import { buildOrderPlan } from '../../../../../lib/shopify/core/orderTransform';
import { executeOrder } from '../../../../../lib/shopify/engine/execute';
import { PipelineError } from '../../../../../lib/shopify/engine/pipeline';
import { ENGINE_CONFIG } from '../../../../../lib/shopify/engine/config';
import { loadKnownSkus } from '../../../../../lib/shopify/engine/deps';
import { createNetSuiteForTarget } from '../../../../../lib/shopify/engine/nsTarget';
import type { ShopifyOrder } from '../../../../../lib/shopify/core/types';

/**
 * Self-service retry for a parked order: re-fetch it from Shopify, re-gate,
 * re-execute. Idempotent by construction — every pipeline step adopts what
 * already exists, so retry is always safe (owner requirement #3).
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const { shopifyOrderId } = await request.json();
    if (!shopifyOrderId || !/^\d+$/.test(String(shopifyOrderId))) {
      return NextResponse.json({ error: 'shopifyOrderId (numeric) is required' }, { status: 400 });
    }
    if (!process.env.SHOPIFY_CLIENT_ID && !process.env.SHOPIFY_ADMIN_TOKEN) {
      return NextResponse.json(
        { error: 'Shopify credentials are not configured in this environment yet' },
        { status: 503 },
      );
    }

    const store = new ShopifySyncStore(createServiceRoleClient());
    const config = await store.getConfig();
    if (config.mode !== 'sandbox' && config.mode !== 'live') {
      return NextResponse.json({ error: `Sync mode is '${config.mode}' — retries only run in sandbox/live` }, { status: 409 });
    }
    const nsTarget = config.mode === 'live' ? 'production' : 'sandbox';
    const ns = createNetSuiteForTarget(nsTarget);

    const data = await shopifyGraphQL(
      `query One($id: ID!) { order: node(id: $id) { ... on Order { ${ORDER_SELECTION} } } }`,
      { id: `gid://shopify/Order/${shopifyOrderId}` },
    );
    const order = data.order as ShopifyOrder | null;
    if (!order?.id) {
      return NextResponse.json({ error: 'Order not found in Shopify' }, { status: 404 });
    }

    const gate = gateOrder(order, await loadKnownSkus());
    if (gate.outcome === 'skip') {
      await store.seenOrder(order, null);
      await store.markSkipped(shopifyOrderId, gate.reason, gate.message);
      return NextResponse.json({ result: 'skipped', reason: gate.reason, message: gate.message });
    }
    if (gate.outcome === 'error') {
      await store.seenOrder(order, null);
      await store.markError(shopifyOrderId, gate.issues);
      return NextResponse.json({ result: 'still_error', issues: gate.issues });
    }

    const plan = buildOrderPlan(order);
    await store.seenOrder(order, plan);
    try {
      const outcome = await executeOrder(order, plan, ns, ENGINE_CONFIG);
      await store.setState(shopifyOrderId, outcome.state, {
        ...outcome.nsIds,
        ns_target: nsTarget,
        error_code: null,
        error_message: null,
        skip_reason: null,
      });
      await store.event('orders', 'retried_ok', shopifyOrderId, { state: outcome.state });
      return NextResponse.json({ result: 'ok', state: outcome.state, nsIds: outcome.nsIds });
    } catch (err: any) {
      const issue =
        err instanceof PipelineError
          ? err.issue
          : { code: 'UNSUPPORTED_SOURCE' as const, message: String(err?.message ?? err).slice(0, 500) };
      await store.markError(shopifyOrderId, [issue]);
      await store.event('orders', 'retried_error', shopifyOrderId, { issue });
      return NextResponse.json({ result: 'still_error', issues: [issue] });
    }
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
