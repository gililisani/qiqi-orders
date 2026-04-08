import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAuthenticatedUser } from '../../../../../../platform/auth/guards';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;
    const {
      forwarding_agent_line1,
      forwarding_agent_line2,
      forwarding_agent_line3,
      forwarding_agent_line4,
      date_of_export,
      in_bond_code,
      instructions_to_forwarder,
      checkbox_states
    } = await request.json();

    const supabaseAdmin = createServiceRoleClient();

    // Get current user (admin). Preserve legacy 401 payload.
    let user: { id: string };
    try {
      user = await requireAuthenticatedUser(request);
    } catch (err: any) {
      if (err instanceof Response && err.status === 401) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      throw err;
    }

    // Verify user is admin
    const { data: admin, error: adminError } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Verify order exists and is in "In Process" status
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.status !== 'Ready' && order.status !== 'Done') {
      return NextResponse.json(
        { error: 'SLI can only be created for orders with status "Ready" or "Done"' },
        { status: 400 }
      );
    }

    // Check if SLI already exists for this order
    const { data: existingSLI } = await supabaseAdmin
      .from('slis')
      .select('id')
      .eq('order_id', orderId)
      .single();

    if (existingSLI) {
      return NextResponse.json(
        { error: 'SLI already exists for this order. Use update endpoint instead.' },
        { status: 400 }
      );
    }

    // Create SLI
    const { data: sli, error: sliError } = await supabaseAdmin
      .from('slis')
      .insert({
        order_id: orderId,
        created_by: user.id,
        forwarding_agent_line1,
        forwarding_agent_line2,
        forwarding_agent_line3,
        forwarding_agent_line4,
        date_of_export,
        in_bond_code,
        instructions_to_forwarder,
        checkbox_states: checkbox_states || {}
      })
      .select()
      .single();

    if (sliError) {
      console.error('Error creating SLI:', sliError);
      return NextResponse.json({ error: 'Failed to create SLI' }, { status: 500 });
    }

    return NextResponse.json({ success: true, sli }, { status: 201 });
  } catch (error: any) {
    console.error('Error in SLI create API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

