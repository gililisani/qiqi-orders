import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { callRouteHandler } from '../../../../lib/internalRoute';
import { POST as sendEmailHandler } from '../send-email/route';

/**
 * POST /api/orders/request-changes  { orderId, message }
 *
 * The stock-shortage flow (owner decision 2026-09-01): instead of the admin
 * editing a client's order (which silently re-decides their support-fund
 * basket) or declining it, the admin asks the CLIENT to adjust it. The order
 * stays Open — still editable by the client — the client gets the custom
 * email, and the request lands on the client-visible timeline.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminWithPermission(request, 'orders');

    const body = await request.json();
    const orderId = typeof body.orderId === 'string' ? body.orderId : null;
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: 'Write the change request message first.' }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: 'Message is too long (2000 characters max).' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.status !== 'Open') {
      return NextResponse.json(
        { error: `Changes can only be requested on Open orders (this order is "${order.status}").` },
        { status: 409 },
      );
    }

    // Email first — if it can't be sent the admin should know and retry,
    // not end up with a timeline entry the client never saw.
    const email = await callRouteHandler(sendEmailHandler, request, {
      orderId,
      emailType: 'custom',
      customMessage: message,
    });
    if (!email.ok) {
      return NextResponse.json(
        { error: email.data.error || 'Failed to send the email to the client.' },
        { status: 502 },
      );
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
        notes: `Changes requested: ${message}`,
        changed_by_id: user.id,
        changed_by_name: adminProfile?.name || 'Qiqi',
        changed_by_role: 'admin',
        visible_to_client: true,
      },
    ]);

    return NextResponse.json({ success: true, emailSkipped: !!email.data.skipped });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('request-changes error:', error);
    return NextResponse.json({ error: error.message || 'Failed to request changes' }, { status: 500 });
  }
}
