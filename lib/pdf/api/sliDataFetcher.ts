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
    date_of_export: sli.date_of_export || new Date().toLocaleDateString('en-US'),
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
    .select('id, hs_code, case_weight, made_in, case_pack')
    .in('id', productIds);

  const productsMap = new Map((products || []).map((p: any) => [p.id, p]));

  // Aggregate products by HS code (mirror HTML logic)
  const aggregatedProducts = new Map<string, {
    hs_code: string;
    total_quantity: number;
    total_weight: number;
    total_value: number;
    made_in: string;
  }>();

  const productsWithoutHS: Array<{
    quantity: number;
    weight: number;
    value: number;
    made_in: string;
  }> = [];

  (orderItems || []).forEach((item: any) => {
    const product = productsMap.get(item.product_id);
    if (!product) return;

    const hsCodeRaw = product.hs_code?.trim() || '';
    const hsCode = hsCodeRaw !== '' ? hsCodeRaw : 'N/A';

    const totalUnits = Number(item.quantity) || 0;
    const casePack = Number(product.case_pack) || 1;
    const storedCaseQty = Number(item.case_qty) || 0;
    const caseQty = storedCaseQty > 0 ? storedCaseQty : Math.ceil(totalUnits / casePack);
    const caseWeight = Number(product.case_weight) || 0;
    const weight = caseQty * caseWeight;
    const value = Number(item.total_price) || 0;
    const madeIn = product.made_in || '';

    if (hsCodeRaw) {
      if (aggregatedProducts.has(hsCode)) {
        const existing = aggregatedProducts.get(hsCode)!;
        existing.total_quantity += totalUnits;
        existing.total_weight += weight;
        existing.total_value += value;
      } else {
        aggregatedProducts.set(hsCode, {
          hs_code: hsCode,
          total_quantity: totalUnits,
          total_weight: weight,
          total_value: value,
          made_in: madeIn,
        });
      }
    } else {
      productsWithoutHS.push({
        quantity: totalUnits,
        weight,
        value,
        made_in: madeIn,
      });
    }
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
    sli_date: sli.date_of_export,
    date_of_export: sli.date_of_export || new Date().toLocaleDateString('en-US'),
    products: [
      ...Array.from(aggregatedProducts.values()).map((p) => ({
        hs_code: p.hs_code,
        quantity: p.total_quantity,
        weight: p.total_weight,
        value: p.total_value,
        made_in: p.made_in,
        total_quantity: p.total_quantity,
        total_weight: p.total_weight,
        total_value: p.total_value,
      })),
      ...productsWithoutHS.map(p => ({
        hs_code: 'N/A',
        quantity: p.quantity,
        weight: p.weight,
        value: p.value,
        made_in: p.made_in,
        total_quantity: p.quantity,
        total_weight: p.weight,
        total_value: p.value,
      })),
    ],
    checkbox_states: sli.checkbox_states || {},
  };
}

