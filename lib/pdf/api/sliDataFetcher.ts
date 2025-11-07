import { createClient } from '@supabase/supabase-js';
import { SLIDocumentData } from '../components/SLIDocument';

/**
 * Fetch standalone SLI data and transform it for PDF generation
 */
export async function fetchStandaloneSLIData(sliId: string): Promise<SLIDocumentData> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Fetch SLI
  const { data: sli, error: sliError } = await supabaseAdmin
    .from('standalone_slis')
    .select('*')
    .eq('id', sliId)
    .single();

  if (sliError || !sli) {
    throw new Error('SLI not found');
  }

  // Parse products
  let selectedProducts = sli.selected_products || [];
  if (typeof selectedProducts === 'string') {
    try {
      selectedProducts = JSON.parse(selectedProducts);
    } catch (e) {
      selectedProducts = [];
    }
  }

  // Fetch product details and aggregate by HS code
  const productIds = selectedProducts
    .map((sp: any) => sp.product_id || sp.id)
    .filter((id: any) => id);

  const { data: products } = await supabaseAdmin
    .from('Products')
    .select('id, hs_code, case_weight, item_name, made_in, price_international')
    .in('id', productIds);

  const productsMap = new Map((products || []).map((p: any) => [p.id, p]));

  // Aggregate products by HS code
  const aggregatedProducts = new Map();
  
  selectedProducts.forEach((sp: any) => {
    const product = productsMap.get(sp.product_id || sp.id);
    if (!product) return;

    const hsCode = product.hs_code || 'N/A';
    const quantity = sp.quantity || 0;
    const unitPrice = (product.price_international ?? 0) as number;
    const caseWeight = (product.case_weight ?? 0) as number;

    if (aggregatedProducts.has(hsCode)) {
      const existing = aggregatedProducts.get(hsCode);
      existing.quantity += quantity;
      existing.weight += caseWeight * quantity;
      existing.value += unitPrice * quantity;
    } else {
      aggregatedProducts.set(hsCode, {
        hs_code: hsCode,
        quantity: quantity,
        weight: caseWeight * quantity,
        value: unitPrice * quantity,
        made_in: product.made_in || '',
      });
    }
  });

  return {
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
    products: Array.from(aggregatedProducts.values()),
    checkbox_states: sli.checkbox_states || {},
  };
}

/**
 * Fetch order-based SLI data and transform it for PDF generation
 */
export async function fetchOrderSLIData(orderId: string, authToken: string): Promise<SLIDocumentData> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Verify auth
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authToken);
  if (userError || !user) {
    throw new Error('Unauthorized');
  }

  // Fetch SLI
  const { data: sli, error: sliError } = await supabaseAdmin
    .from('slis')
    .select('*')
    .eq('order_id', orderId)
    .single();

  if (sliError || !sli) {
    throw new Error('SLI not found for this order');
  }

  // Fetch order and company
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
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
    throw new Error('Order not found');
  }

  // Fetch order items and products
  const { data: orderItems } = await supabaseAdmin
    .from('order_items')
    .select('*, product_id, quantity, case_qty, total_price')
    .eq('order_id', orderId);

  const productIds = (orderItems || []).map((item: any) => item.product_id);
  const { data: products } = await supabaseAdmin
    .from('Products')
    .select('id, hs_code, case_weight, made_in')
    .in('id', productIds);

  const productsMap = new Map((products || []).map((p: any) => [p.id, p]));

  // Build products array
  const sliProducts = (orderItems || []).map((item: any) => {
    const product = productsMap.get(item.product_id);
    return {
      hs_code: product?.hs_code || '',
      quantity: item.case_qty || item.quantity || 0,
      weight: (product?.case_weight || 0) * (item.case_qty || 0),
      value: item.total_price || 0,
      made_in: product?.made_in || '',
    };
  });

  const company = order.companies as any;

  return {
    sli_number: 0, // Order-based SLIs don't have SLI numbers
    invoice_number: order.invoice_number,
    consignee_name: company?.company_name || '',
    consignee_address_line1: company?.ship_to_street_line_1 || '',
    consignee_address_line2: company?.ship_to_street_line_2 || '',
    consignee_address_line3: `${company?.ship_to_city || ''}, ${company?.ship_to_state || ''} ${company?.ship_to_postal_code || ''}`,
    consignee_country: company?.ship_to_country || '',
    forwarding_agent_line1: sli.forwarding_agent_line1,
    forwarding_agent_line2: sli.forwarding_agent_line2,
    forwarding_agent_line3: sli.forwarding_agent_line3,
    forwarding_agent_line4: sli.forwarding_agent_line4,
    in_bond_code: sli.in_bond_code,
    instructions_to_forwarder: sli.instructions_to_forwarder,
    date_of_export: sli.date_of_export,
    products: sliProducts,
    checkbox_states: sli.checkbox_states || {},
  };
}

