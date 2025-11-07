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

    // Verify user
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
      return NextResponse.json({ error: 'SLI not found for this order' }, { status: 404 });
    }

    // Fetch order and company
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
      return NextResponse.json({ error: 'Failed to fetch order items' }, { status: 500 });
    }

    // Fetch products
    const productIds = (orderItems || []).map((item: any) => item.product_id);
    const { data: products, error: productsError } = await supabaseAdmin
      .from('Products')
      .select('id, hs_code, case_weight, item_name, made_in')
      .in('id', productIds);

    if (productsError) {
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    const productsMap = new Map(products?.map((p: any) => [p.id, p]) || []);
    const company = order.companies as any;

    // Prepare products array (aggregate by HS Code)
    const productsForAggregation: Array<{
      hs_code: string;
      quantity: number;
      case_qty: number;
      case_weight: number;
      total_price: number;
      made_in: string;
      item_name: string;
    }> = [];

    (orderItems || []).forEach((item: any) => {
      const product = productsMap.get(item.product_id);
      if (!product) return;

      productsForAggregation.push({
        hs_code: product.hs_code || 'N/A',
        quantity: item.quantity || 0,
        case_qty: item.case_qty || item.quantity || 0,
        case_weight: product.case_weight || 0,
        total_price: item.total_price || 0,
        made_in: product.made_in || '',
        item_name: product.item_name || '',
      });
    });

    // Aggregate by HS Code
    const groupedProducts: Map<string, {
      hs_code: string;
      total_quantity: number;
      total_weight: number;
      total_value: number;
      made_in: string;
      item_names: string[];
    }> = new Map();

    productsForAggregation.forEach(product => {
      const totalWeight = product.case_qty * product.case_weight;
      
      if (product.hs_code && product.hs_code.trim() !== '' && product.hs_code !== 'N/A') {
        const hsCode = product.hs_code.trim();
        
        if (groupedProducts.has(hsCode)) {
          const existing = groupedProducts.get(hsCode)!;
          existing.total_quantity += product.quantity;
          existing.total_weight += totalWeight;
          existing.total_value += product.total_price;
          existing.item_names.push(product.item_name);
        } else {
          groupedProducts.set(hsCode, {
            hs_code: hsCode,
            total_quantity: product.quantity,
            total_weight: totalWeight,
            total_value: product.total_price,
            made_in: product.made_in || '',
            item_names: [product.item_name],
          });
        }
      } else {
        // N/A products
        if (groupedProducts.has('N/A')) {
          const existing = groupedProducts.get('N/A')!;
          existing.total_quantity += product.quantity;
          existing.total_weight += totalWeight;
          existing.total_value += product.total_price;
          existing.item_names.push(product.item_name);
        } else {
          groupedProducts.set('N/A', {
            hs_code: 'N/A',
            total_quantity: product.quantity,
            total_weight: totalWeight,
            total_value: product.total_price,
            made_in: product.made_in || '',
            item_names: [product.item_name],
          });
        }
      }
    });

    // Convert to array format for PDF
    // Calculate average case_weight for aggregated products
    const pdfProducts = Array.from(groupedProducts.values()).map(group => {
      // Find original products to get average case_weight
      const matchingProducts = productsForAggregation.filter(p => 
        (p.hs_code || 'N/A') === group.hs_code
      );
      const avgCaseWeight = matchingProducts.length > 0
        ? matchingProducts.reduce((sum, p) => sum + p.case_weight, 0) / matchingProducts.length
        : group.total_weight / group.total_quantity;
      
      return {
        hs_code: group.hs_code,
        quantity: group.total_quantity,
        case_qty: group.total_quantity,
        case_weight: avgCaseWeight,
        total_price: group.total_value,
        made_in: group.made_in,
        item_name: group.item_names.join(', '),
      };
    });

    // Format dates
    const creationDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const dateOfExport = sli.date_of_export
      ? new Date(sli.date_of_export).toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      : undefined;

    // Return data in format expected by PDF generator
    return NextResponse.json({
      sli_number: 0, // Order SLIs don't have SLI numbers, use 0 or order invoice
      creation_date: creationDate,
      invoice_number: order.invoice_number || '',
      consignee_name: company?.company_name || '',
      consignee_address_line1: company?.ship_to_street_line_1 || '',
      consignee_address_line2: company?.ship_to_street_line_2 || undefined,
      consignee_address_line3: `${company?.ship_to_city || ''}, ${company?.ship_to_state || ''}, ${company?.ship_to_postal_code || ''}`.trim() || undefined,
      consignee_country: company?.ship_to_country || '',
      forwarding_agent_line1: sli.forwarding_agent_line1 || undefined,
      forwarding_agent_line2: sli.forwarding_agent_line2 || undefined,
      forwarding_agent_line3: sli.forwarding_agent_line3 || undefined,
      forwarding_agent_line4: sli.forwarding_agent_line4 || undefined,
      date_of_export: dateOfExport,
      in_bond_code: sli.in_bond_code || undefined,
      instructions_to_forwarder: sli.instructions_to_forwarder || undefined,
      products: pdfProducts,
    });

  } catch (error: any) {
    console.error('Error fetching order SLI data:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch SLI data' }, { status: 500 });
  }
}

