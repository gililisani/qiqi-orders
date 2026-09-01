import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../../lib/shopify/store';
import { fetchOrderByName, retryOrder } from '../../../../../lib/shopify/engine/retryOrder';

/** Manual import by order number — the cure for NetScore's "lost order" class. */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'shopify:edit');
    const { orderName } = await request.json();
    if (!orderName?.trim()) return NextResponse.json({ error: 'orderName is required' }, { status: 400 });
    if (!process.env.SHOPIFY_CLIENT_ID && !process.env.SHOPIFY_ADMIN_TOKEN) {
      return NextResponse.json({ error: 'Shopify credentials are not configured in this environment yet' }, { status: 503 });
    }
    const store = new ShopifySyncStore(createServiceRoleClient());
    const order = await fetchOrderByName(String(orderName).trim());
    if (!order) return NextResponse.json({ error: `Order ${orderName} not found in Shopify` }, { status: 404 });
    return NextResponse.json(await retryOrder(order, store));
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
