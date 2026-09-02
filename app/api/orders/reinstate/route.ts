import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';

/**
 * POST /api/orders/reinstate  { orderId }
 *
 * "Reinstate Order" — brings a Cancelled order back to Open (owner request
 * 2026-09-02). Open means the normal life restarts: the client can edit it
 * again and the admin can Accept it. Only Cancelled orders qualify, and a
 * cancelled order never carries NetSuite/warehouse links (Cancel Order
 * clears them), so nothing external needs re-checking.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminWithPermission(request, 'orders:edit');

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, netsuite_so_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.status !== 'Cancelled') {
      return NextResponse.json(
        { error: `Only Cancelled orders can be reinstated (this order is "${order.status}").` },
        { status: 409 },
      );
    }
    if (order.netsuite_so_id) {
      return NextResponse.json(
        { error: 'This cancelled order still has a NetSuite SO linked — unlink it before reinstating.' },
        { status: 409 },
      );
    }

    // Atomic claim so a double-click can't produce two history entries.
    const { data: claimed, error: updateError } = await supabase
      .from('orders')
      .update({ status: 'Open' })
      .eq('id', orderId)
      .eq('status', 'Cancelled')
      .select('id');
    if (updateError) throw new Error(`reinstate write: ${updateError.message}`);
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: 'Order was already reinstated.' }, { status: 409 });
    }

    const { data: adminProfile } = await supabase
      .from('admins')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();

    await supabase.from('order_history').insert([
      {
        action_type: 'status_change',
        order_id: orderId,
        status_from: 'Cancelled',
        status_to: 'Open',
        notes: 'Order reinstated',
        changed_by_id: user.id,
        changed_by_name: adminProfile?.name || 'Qiqi',
        changed_by_role: 'admin',
        visible_to_client: true,
      },
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('reinstate order error:', error);
    return NextResponse.json({ error: error.message || 'Failed to reinstate order' }, { status: 500 });
  }
}
