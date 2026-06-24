import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../../platform/auth/guards';
import { getFulfillmentProvider } from '../../../../../lib/fulfillment';

/**
 * POST /api/fulfillment/shiphero/cancel  { orderId, reason? }
 *
 * Admin-only. Cancels the order in ShipHero and marks it cancelled in the Hub.
 * Respects the dry-run gate (in dry-run nothing is sent and the Hub is not
 * changed). Requires the order to have been sent to ShipHero.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { orderId, reason } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, status, external_fulfillment_id, fulfillment_status')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (!order.external_fulfillment_id) {
      return NextResponse.json({ error: 'This order has not been sent to ShipHero.' }, { status: 400 });
    }

    const provider = getFulfillmentProvider('shiphero');
    if (!provider.cancelOrder) {
      return NextResponse.json({ error: 'Provider does not support cancellation.' }, { status: 400 });
    }

    const result = await provider.cancelOrder(order.external_fulfillment_id, reason || undefined);

    if (result.dryRun) {
      return NextResponse.json({ success: true, dryRun: true });
    }

    await supabase
      .from('orders')
      .update({ fulfillment_status: 'cancelled', fulfillment_synced_at: new Date().toISOString() })
      .eq('id', orderId);

    await supabase.from('order_history').insert([
      {
        action_type: 'order_updated',
        order_id: orderId,
        status_from: order.status,
        status_to: order.status,
        notes: 'ShipHero fulfillment cancelled.',
        changed_by_name: 'System',
        changed_by_role: 'admin',
      },
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('shiphero cancel error:', error);
    return NextResponse.json({ error: error.message || 'Failed to cancel in ShipHero' }, { status: 500 });
  }
}
