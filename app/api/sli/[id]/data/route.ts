import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sliId = params.id;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Fetch standalone SLI
    const { data: sli, error: sliError } = await supabaseAdmin
      .from('standalone_slis')
      .select('*')
      .eq('id', sliId)
      .single();

    if (sliError || !sli) {
      return NextResponse.json({ error: 'SLI not found' }, { status: 404 });
    }

    // Parse selected_products
    let selectedProducts = sli.selected_products || [];
    if (typeof selectedProducts === 'string') {
      selectedProducts = JSON.parse(selectedProducts);
    }

    if (!Array.isArray(selectedProducts) || selectedProducts.length === 0) {
      return NextResponse.json({ error: 'No products found' }, { status: 400 });
    }

    // Fetch product details
    const productIds = selectedProducts.map((sp: any) => sp.product_id || sp.id).filter((id: any) => id);
    
    const { data: products, error: productsError } = await supabaseAdmin
      .from('Products')
      .select('id, hs_code, case_weight, made_in, price_international')
      .in('id', productIds);

    if (productsError || !products) {
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    const productsMap = new Map(products.map((p: any) => [p.id, p]));

    // Build products array
    const sliProducts = selectedProducts.map((sp: any) => {
      const product = productsMap.get(sp.product_id || sp.id);
      if (!product) return null;

      return {
        hs_code: product.hs_code || sp.hs_code || 'N/A',
        quantity: sp.quantity || 0,
        case_weight: (product.case_weight || 0) * (sp.quantity || 0),
        total_price: (product.price_international || 0) * (sp.quantity || 0),
        made_in: product.made_in || 'CN',
      };
    }).filter((p: any) => p !== null);

    // Return SLI data
    return NextResponse.json({
      sli_number: sli.sli_number,
      invoice_number: sli.invoice_number,
      consignee_name: sli.consignee_name,
      consignee_address_line1: sli.consignee_address_line1,
      consignee_address_line2: sli.consignee_address_line2,
      consignee_address_line3: sli.consignee_address_line3,
      consignee_country: sli.consignee_country,
      forwarding_agent_line1: sli.forwarding_agent_line1,
      forwarding_agent_line2: sli.forwarding_agent_line2,
      forwarding_agent_line3: sli.forwarding_agent_line3,
      forwarding_agent_line4: sli.forwarding_agent_line4,
      in_bond_code: sli.in_bond_code,
      instructions_to_forwarder: sli.instructions_to_forwarder,
      sli_date: sli.sli_date,
      date_of_export: sli.date_of_export,
      products: sliProducts,
      checkbox_states: sli.checkbox_states || {},
    });

  } catch (error: any) {
    console.error('Error fetching SLI data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
