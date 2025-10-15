import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Get current user
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

