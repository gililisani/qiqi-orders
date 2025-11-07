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

    // Get auth token
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch SLI
    const { data: sli, error: sliError } = await supabaseAdmin
      .from('slis')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (sliError || !sli) {
      return NextResponse.json({ error: 'SLI not found' }, { status: 404 });
    }

    // Fetch order data
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        companies(
          company_name,
          ship_to_street_line_1,
          ship_to_street_line_2,
          ship_to_city,
          ship_to_state,
          ship_to_postal_code,
          ship_to_country
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Fetch order items with products
    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('*, product_id, quantity, case_qty, total_price')
      .eq('order_id', orderId);

    if (itemsError) {
      return NextResponse.json({ error: 'Failed to fetch order items' }, { status: 500 });
    }

    // Fetch product details
    const productIds = orderItems?.map((item: any) => item.product_id) || [];
    const { data: products, error: productsError } = await supabaseAdmin
      .from('Products')
      .select('id, hs_code, case_weight, made_in, price_international')
      .in('id', productIds);

    if (productsError) {
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    const productsMap = new Map((products || []).map((p: any) => [p.id, p]));

    // Build products array
    const sliProducts = (orderItems || []).map((item: any) => {
      const product = productsMap.get(item.product_id);
      return {
        hs_code: product?.hs_code || 'N/A',
        quantity: item.case_qty || item.quantity || 0,
        case_weight: (product?.case_weight || 0) * (item.case_qty || item.quantity || 0),
        total_price: item.total_price || 0,
        made_in: product?.made_in || 'CN',
      };
    });

    const company = order.companies as any;

    // Return SLI data
    return NextResponse.json({
      sli_number: 0, // Order-based SLIs don't have SLI numbers
      invoice_number: order.invoice_number || '',
      consignee_name: company?.company_name || '',
      consignee_address_line1: company?.ship_to_street_line_1 || '',
      consignee_address_line2: company?.ship_to_street_line_2 || '',
      consignee_address_line3: `${company?.ship_to_city || ''}, ${company?.ship_to_state || ''} ${company?.ship_to_postal_code || ''}`,
      consignee_country: company?.ship_to_country || '',
      forwarding_agent_line1: sli.forwarding_agent_line1 || '',
      forwarding_agent_line2: sli.forwarding_agent_line2 || '',
      forwarding_agent_line3: sli.forwarding_agent_line3 || '',
      forwarding_agent_line4: sli.forwarding_agent_line4 || '',
      in_bond_code: sli.in_bond_code || '',
      instructions_to_forwarder: sli.instructions_to_forwarder || '',
      sli_date: new Date().toISOString().split('T')[0],
      date_of_export: sli.date_of_export || '',
      products: sliProducts,
      checkbox_states: sli.checkbox_states || {},
    });

  } catch (error: any) {
    console.error('Error fetching SLI data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
