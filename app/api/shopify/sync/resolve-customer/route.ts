import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../../lib/shopify/store';
import { fetchOrderById, retryOrder } from '../../../../../lib/shopify/engine/retryOrder';
import { extractBuyer } from '../../../../../lib/shopify/core/customerMatch';
import { buildOrderPlan } from '../../../../../lib/shopify/core/orderTransform';
import { engineConfigForTarget } from '../../../../../lib/shopify/engine/config';
import { createNetSuiteForTarget } from '../../../../../lib/shopify/engine/nsTarget';

/**
 * Ambiguous-customer resolver: the admin picks which NS customer this
 * buyer is; we stamp our externalid on that record, then retry — the
 * ladder's rung 0 matches instantly and forever after.
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
    const nsTarget = config.mode === 'live' ? ('production' as const) : ('sandbox' as const);
    const ns = createNetSuiteForTarget(nsTarget);
    const engineConfig = engineConfigForTarget(nsTarget);

    const order = await fetchOrderById(String(shopifyOrderId));
    if (!order) return NextResponse.json({ error: 'Order not found in Shopify' }, { status: 404 });

    // Verify the chosen customer exists and is active before stamping.
    // (No NetScore custentity reference — the field dies with their bundle.)
    const rows = await ns.suiteQL<{ id: string; isinactive: string; category: string | null; custentity3: string | null; terms: string | null }>(
      `SELECT id, isinactive, category, custentity3, terms FROM customer WHERE id = ${Number(nsCustomerId)}`,
    );
    if (!rows.length) return NextResponse.json({ error: 'NS customer not found' }, { status: 404 });
    if (rows[0].isinactive === 'T') return NextResponse.json({ error: 'NS customer is inactive' }, { status: 409 });

    const buyer = extractBuyer(order);
    const buyerKey =
      buyer.kind === 'b2b' && buyer.shopifyCompanyId ? `CO-${buyer.shopifyCompanyId}` : `CUST-${buyer.shopifyCustomerId}`;
    const stamp: Record<string, unknown> = { externalId: engineConfig.externalIds.customer(buyerKey) };
    // This account makes Category/Class mandatory and PATCH re-validates the
    // whole record (#6599: "Please enter value(s) for: Class") — fill what's
    // missing with the per-kind defaults, exactly like the pipeline's adopt.
    const defaults = engineConfig.customerDefaults[buyer.kind];
    if (!rows[0].category) stamp.category = { id: defaults.category };
    if (!rows[0].custentity3) stamp.custentity3 = { id: defaults.class };
    if (!rows[0].terms) stamp.terms = { id: engineConfig.termsId };
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
