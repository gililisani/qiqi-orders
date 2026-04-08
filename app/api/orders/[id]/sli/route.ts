import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAuthenticatedUser } from '../../../../../platform/auth/guards';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;

    const supabaseAdmin = createServiceRoleClient();

    // Get current user (standardized via guards). Preserve legacy 401 payload.
    let user: { id: string };
    try {
      user = await requireAuthenticatedUser(request);
    } catch (err: any) {
      if (err instanceof Response && err.status === 401) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      throw err;
    }

    // Check if user is admin or client with access to this order
    const { data: admin } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();

    const isAdmin = !!admin;

    if (!isAdmin) {
      // Verify client has access to this order via company
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('company_id')
        .eq('id', orderId)
        .single();

      if (orderError || !order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!client || client.company_id !== order.company_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Get SLI data
    const { data: sli, error: sliError } = await supabaseAdmin
      .from('slis')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (sliError) {
      if (sliError.code === 'PGRST116') {
        // No SLI found
        return NextResponse.json({ sli: null }, { status: 200 });
      }
      console.error('Error fetching SLI:', sliError);
      return NextResponse.json({ error: 'Failed to fetch SLI' }, { status: 500 });
    }

    return NextResponse.json({ sli }, { status: 200 });
  } catch (error: any) {
    console.error('Error in SLI get API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

