import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';

/**
 * POST /api/orders/hold  { orderId, hold: 'payment_hold' | null }
 *
 * Manual hold toggle (status/badge redesign 2026-09-06). Only the payment
 * hold is set by hand — it blocks the warehouse push server-side (guard in
 * /api/fulfillment/shiphero/push) until payment lands or an admin clears it.
 * `hold: null` clears whichever hold is set (payment_hold, or a stale
 * awaiting_client the admin wants gone).
 *
 * The AUTOMATIC transitions live elsewhere:
 *   set awaiting_client  → /api/orders/request-changes
 *   clear awaiting_client → client re-save in /api/orders/save
 *   set payment_hold      → checkbox on "Push to NetSuite only" (push-so)
 *   clear payment_hold    → Stripe webhook / nightly invoice sync on payment
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminWithPermission(request, 'orders:edit');

    const body = await request.json();
    const orderId = typeof body.orderId === 'string' ? body.orderId : null;
    const hold = body.hold === 'payment_hold' ? 'payment_hold' : body.hold === null ? null : undefined;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }
    if (hold === undefined) {
      return NextResponse.json(
        { error: "hold must be 'payment_hold' or null (awaiting_client is automation-managed)." },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, hold')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (hold === 'payment_hold' && ['Draft', 'Done', 'Cancelled'].includes(order.status)) {
      return NextResponse.json(
        { error: `A payment hold makes no sense on a ${order.status} order.` },
        { status: 409 },
      );
    }
    if (order.hold === hold) {
      return NextResponse.json({ success: true, hold, unchanged: true });
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({ hold })
      .eq('id', orderId);
    if (updateError) {
      return NextResponse.json({ error: `Failed to update the hold: ${updateError.message}` }, { status: 500 });
    }

    const { data: adminProfile } = await supabase
      .from('admins')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();

    await supabase.from('order_history').insert([
      {
        action_type: 'order_updated',
        order_id: orderId,
        status_from: order.status,
        status_to: order.status,
        notes:
          hold === 'payment_hold'
            ? 'Payment hold set — the order will not go to the warehouse until the payment is received (or the hold is cleared).'
            : order.hold === 'payment_hold'
              ? 'Payment hold cleared manually.'
              : 'Awaiting-client hold cleared manually.',
        changed_by_id: user.id,
        changed_by_name: adminProfile?.name || 'Qiqi',
        changed_by_role: 'admin',
      },
    ]);

    return NextResponse.json({ success: true, hold });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('order hold error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update the hold' }, { status: 500 });
  }
}
