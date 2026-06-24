import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../../platform/auth/guards';
import { getFulfillmentProvider } from '../../../../../lib/fulfillment';

/**
 * POST /api/fulfillment/shiphero/sync-status  { orderId }
 *
 * Admin-only. Pulls the order's current fulfillment state from ShipHero and
 * stores it on the Hub order. Read-only against ShipHero (works regardless of
 * the dry-run gate), so the Hub can show live status even before the webhook
 * is registered.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, external_fulfillment_id')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (!order.external_fulfillment_id) {
      return NextResponse.json({ error: 'This order has not been sent to ShipHero.' }, { status: 400 });
    }

    const provider = getFulfillmentProvider('shiphero');
    if (!provider.getFulfillment) {
      return NextResponse.json({ error: 'Provider does not support status sync.' }, { status: 400 });
    }

    const snap = await provider.getFulfillment(order.external_fulfillment_id);

    await supabase
      .from('orders')
      .update({
        fulfillment_status: snap.status,
        tracking_number: snap.trackingNumber ?? null,
        tracking_carrier: snap.carrier ?? null,
        fulfillment_synced_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    return NextResponse.json({
      success: true,
      status: snap.status,
      trackingNumber: snap.trackingNumber ?? null,
      carrier: snap.carrier ?? null,
      trackingUrl: snap.trackingUrl ?? null,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('shiphero sync-status error:', error);
    return NextResponse.json({ error: error.message || 'Failed to sync status from ShipHero' }, { status: 500 });
  }
}
