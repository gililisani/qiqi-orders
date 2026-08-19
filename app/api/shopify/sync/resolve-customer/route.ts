import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../../lib/shopify/store';
import { fetchOrderById, retryOrder } from '../../../../../lib/shopify/engine/retryOrder';
import { extractBuyer } from '../../../../../lib/shopify/core/customerMatch';
import { buildOrderPlan } from '../../../../../lib/shopify/core/orderTransform';
import { ENGINE_CONFIG } from '../../../../../lib/shopify/engine/config';
import { createNetSuiteForTarget } from '../../../../../lib/shopify/engine/nsTarget';

/**
 * Ambiguous-customer resolver: the admin picks which NS customer this
 * buyer is; we stamp our externalid (+ NetScore's field when missing) on
 * that record, then retry — the ladder's rung 0 matches instantly and
 * forever after.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const { shopifyOrderId, nsCustomerId } = await request.json();
    if (!/^\d+$/.test(String(shopifyOrderId ?? '')) || !/^\d+$/.test(String(nsCustomerId ?? ''))) {
      return NextResponse.json({ error: 'shopifyOrderId and nsCustomerId (numeric) are required' }, { status: 400 });
    }
    const store = new ShopifySyncStore(createServiceRoleClient());
    const config = await store.getConfig();
    if (config.mode !== 'sandbox' && config.mode !== 'live') {
      return NextResponse.json({ error: `Sync mode is '${config.mode}'` }, { status: 409 });
    }
    const ns = createNetSuiteForTarget(config.mode === 'live' ? 'production' : 'sandbox');

    const order = await fetchOrderById(String(shopifyOrderId));
    if (!order) return NextResponse.json({ error: 'Order not found in Shopify' }, { status: 404 });

    // Verify the chosen customer exists and is active before stamping.
    const rows = await ns.suiteQL<{ id: string; isinactive: string; custentity_shop_cust_id?: string }>(
      `SELECT id, isinactive, custentity_shop_cust_id FROM customer WHERE id = ${Number(nsCustomerId)}`,
    );
    if (!rows.length) return NextResponse.json({ error: 'NS customer not found' }, { status: 404 });
    if (rows[0].isinactive === 'T') return NextResponse.json({ error: 'NS customer is inactive' }, { status: 409 });

    const buyer = extractBuyer(order);
    const buyerKey =
      buyer.kind === 'b2b' && buyer.shopifyCompanyId ? `CO-${buyer.shopifyCompanyId}` : `CUST-${buyer.shopifyCustomerId}`;
    const stamp: Record<string, unknown> = { externalId: ENGINE_CONFIG.externalIds.customer(buyerKey) };
    if (!rows[0].custentity_shop_cust_id && buyer.shopifyCustomerId) {
      stamp.custentity_shop_cust_id = Number(buyer.shopifyCustomerId);
    }
    await ns.updateRecord('customer', String(nsCustomerId), stamp);
    await store.event('orders', 'customer_resolved', String(shopifyOrderId), {
      nsCustomerId: String(nsCustomerId),
      buyer: buildOrderPlan(order).buyer.displayName,
    });

    return NextResponse.json(await retryOrder(order, store));
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
