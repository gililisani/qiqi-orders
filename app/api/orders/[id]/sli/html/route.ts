import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSLIHTML } from '../../../../../../../lib/sliGenerator';

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

    // Get current user (admin only)
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Fetch SLI data
    const { data: sli, error: sliError } = await supabaseAdmin
      .from('slis')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (sliError || !sli) {
      return NextResponse.json({ error: 'SLI not found for this order' }, { status: 404 });
    }

    // Fetch order data
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        invoice_number,
        company_id,
        companies (
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

    // Fetch order items
    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select(`
        id,
        quantity,
        case_qty,
        total_price,
        product_id
      `)
      .eq('order_id', orderId)
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (itemsError) {
      console.error('Error fetching order items:', itemsError);
      return NextResponse.json({ error: 'Failed to fetch order items' }, { status: 500 });
    }

    // Fetch products
    const productIds = (orderItems || []).map((item: any) => item.product_id);
    const { data: products, error: productsError } = await supabaseAdmin
      .from('Products')
      .select('id, hs_code, case_weight, item_name')
      .in('id', productIds);

    if (productsError) {
      console.error('Error fetching products:', productsError);
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    // Map products to items
    const productsMap = new Map(products?.map((p: any) => [p.id, p]) || []);

    // Prepare data for HTML generation
    const company = order.companies as any;
    const sliData = {
      forwarding_agent_line1: sli.forwarding_agent_line1 || '',
      forwarding_agent_line2: sli.forwarding_agent_line2 || '',
      forwarding_agent_line3: sli.forwarding_agent_line3 || '',
      forwarding_agent_line4: sli.forwarding_agent_line4 || '',
      in_bond_code: sli.in_bond_code || '',
      instructions_to_forwarder: sli.instructions_to_forwarder || '',
      invoice_number: order.invoice_number || '',
      company_name: company?.company_name || '',
      ship_to_street_line_1: company?.ship_to_street_line_1 || '',
      ship_to_street_line_2: company?.ship_to_street_line_2 || '',
      ship_to_city: company?.ship_to_city || '',
      ship_to_state: company?.ship_to_state || '',
      ship_to_postal_code: company?.ship_to_postal_code || '',
      ship_to_country: company?.ship_to_country || '',
      products: (orderItems || []).map((item: any) => {
        const product = productsMap.get(item.product_id);
        return {
          hs_code: product?.hs_code || '',
          quantity: item.quantity || 0,
          case_qty: item.case_qty || 0,
          case_weight: product?.case_weight || 0,
          total_price: item.total_price || 0,
        };
      }),
      creation_date: new Date().toISOString().split('T')[0],
    };

    // Generate HTML
    const html = generateSLIHTML(sliData);

    return NextResponse.json({ html }, { status: 200 });

  } catch (error: any) {
    console.error('Error generating SLI HTML:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

