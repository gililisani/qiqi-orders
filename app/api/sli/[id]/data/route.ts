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
      try {
        selectedProducts = JSON.parse(selectedProducts);
      } catch (e) {
        selectedProducts = [];
      }
    }

    if (!Array.isArray(selectedProducts) || selectedProducts.length === 0) {
      return NextResponse.json({ error: 'No products found in SLI' }, { status: 400 });
    }

    // Fetch product details
    const productIds = selectedProducts
      .map((sp: any) => sp.product_id || sp.id)
      .filter((id: any) => id);

    if (productIds.length === 0) {
      return NextResponse.json({ error: 'No valid product IDs found' }, { status: 400 });
    }

    const { data: products, error: productsError } = await supabaseAdmin
      .from('Products')
      .select('id, hs_code, case_weight, item_name, made_in, price_international')
      .in('id', productIds);

    if (productsError || !products || products.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    const productsMap = new Map(products.map((p: any) => [p.id, p]));

    // Prepare products array (aggregate by HS Code like the HTML generator does)
    const productsForAggregation: Array<{
      hs_code: string;
      quantity: number;
      case_qty: number;
      case_weight: number;
      total_price: number;
      made_in: string;
      item_name: string;
    }> = [];

    selectedProducts.forEach((sp: any) => {
      const product = productsMap.get(sp.product_id || sp.id);
      if (!product) return;

      const quantity = sp.quantity || 0;
      const caseWeight = (product.case_weight ?? 0) as number;
      const unitPrice = (product.price_international ?? 0) as number;

      productsForAggregation.push({
        hs_code: product.hs_code || 'N/A',
        quantity: quantity,
        case_qty: quantity,
        case_weight: caseWeight,
        total_price: quantity * unitPrice,
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
        // N/A products - aggregate separately
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
    const pdfProducts = Array.from(groupedProducts.values()).map(group => ({
      hs_code: group.hs_code,
      quantity: group.total_quantity,
      case_qty: group.total_quantity,
      case_weight: group.total_weight / group.total_quantity, // Average weight
      total_price: group.total_value,
      made_in: group.made_in,
      item_name: group.item_names.join(', '), // Combine item names
    }));

    // Format date
    const sliDate = sli.sli_date 
      ? new Date(sli.sli_date).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
        })
      : new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
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
      sli_number: sli.sli_number,
      creation_date: sliDate,
      invoice_number: sli.invoice_number,
      consignee_name: sli.consignee_name,
      consignee_address_line1: sli.consignee_address_line1,
      consignee_address_line2: sli.consignee_address_line2 || undefined,
      consignee_address_line3: sli.consignee_address_line3 || undefined,
      consignee_country: sli.consignee_country,
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
    console.error('Error fetching SLI data:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch SLI data' }, { status: 500 });
  }
}

