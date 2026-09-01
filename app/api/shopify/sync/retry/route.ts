import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../../lib/shopify/store';
import { fetchOrderById, retryOrder } from '../../../../../lib/shopify/engine/retryOrder';

/** Self-service retry — always safe (idempotent ensure-steps). */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'shopify:edit');
    const { shopifyOrderId } = await request.json();
    if (!shopifyOrderId || !/^\d+$/.test(String(shopifyOrderId))) {
      return NextResponse.json({ error: 'shopifyOrderId (numeric) is required' }, { status: 400 });
    }
    if (!process.env.SHOPIFY_CLIENT_ID && !process.env.SHOPIFY_ADMIN_TOKEN) {
      return NextResponse.json({ error: 'Shopify credentials are not configured in this environment yet' }, { status: 503 });
    }
    const store = new ShopifySyncStore(createServiceRoleClient());
    const order = await fetchOrderById(String(shopifyOrderId));
    if (!order) return NextResponse.json({ error: 'Order not found in Shopify' }, { status: 404 });
    return NextResponse.json(await retryOrder(order, store));
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
