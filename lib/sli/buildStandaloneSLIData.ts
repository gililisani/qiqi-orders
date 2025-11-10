import { SupabaseClient } from '@supabase/supabase-js';

interface SelectedProduct {
  product_id?: string;
  id?: string;
  hs_code?: string;
  quantity?: number;
  case_qty?: number;
  made_in?: string;
  total_price?: number;
}

interface StandaloneSLIRecord {
  forwarding_agent_line1?: string;
  forwarding_agent_line2?: string;
  forwarding_agent_line3?: string;
  forwarding_agent_line4?: string;
  in_bond_code?: string;
  instructions_to_forwarder?: string;
  invoice_number?: string;
  consignee_name?: string;
  consignee_address_line1?: string;
  consignee_address_line2?: string;
  consignee_address_line3?: string;
  consignee_country?: string;
  selected_products?: SelectedProduct[] | string;
}

interface GeneratorProduct {
  hs_code: string;
  quantity: number;
  case_qty: number;
  case_weight: number;
  total_price: number;
  made_in: string;
}

interface GeneratorData {
  forwarding_agent_line1: string;
  forwarding_agent_line2: string;
  forwarding_agent_line3: string;
  forwarding_agent_line4: string;
  in_bond_code: string;
  instructions_to_forwarder: string;
  invoice_number: string;
  company_name: string;
  ship_to_street_line_1: string;
  ship_to_street_line_2: string;
  ship_to_city: string;
  ship_to_state: string;
  ship_to_postal_code: string;
  ship_to_country: string;
  products: GeneratorProduct[];
  creation_date: string;
}

export async function buildStandaloneSLIData(
  sli: StandaloneSLIRecord,
  supabaseAdmin: SupabaseClient
): Promise<GeneratorData> {
  let selectedProducts = sli.selected_products || [];

  if (typeof selectedProducts === 'string') {
    try {
      selectedProducts = JSON.parse(selectedProducts);
    } catch (error) {
      selectedProducts = [];
    }
  }

  if (!Array.isArray(selectedProducts) || selectedProducts.length === 0) {
    selectedProducts = [];
  }

  const productIds = selectedProducts
    .map((sp) => sp.product_id || sp.id)
    .filter((id): id is string => Boolean(id));

  let productsMap = new Map<string, any>();
  if (productIds.length > 0) {
    const { data: products } = await supabaseAdmin
      .from('Products')
      .select('id, hs_code, case_weight, case_pack, price_international, made_in')
      .in('id', productIds);

    productsMap = new Map((products || []).map((product: any) => [product.id, product]));
  }

  const generatorProducts: GeneratorProduct[] = selectedProducts
    .map((sp) => {
      const product = productsMap.get(sp.product_id || sp.id);
      const quantity = Number(sp.quantity) || 0;
      const caseQty = Number(sp.case_qty) || quantity;
      const caseWeight = Number(product?.case_weight) || 0;
      const unitPrice = Number(product?.price_international) || 0;
      const totalPrice = sp.total_price !== undefined
        ? Number(sp.total_price) || 0
        : unitPrice * quantity;

      return {
        hs_code: (product?.hs_code || sp.hs_code || '').trim() || 'N/A',
        quantity,
        case_qty: caseQty,
        case_weight: caseWeight,
        total_price: totalPrice,
        made_in: product?.made_in || sp.made_in || '',
      };
    })
    .filter((product) => product.quantity > 0);

  return {
    forwarding_agent_line1: sli.forwarding_agent_line1 || '',
    forwarding_agent_line2: sli.forwarding_agent_line2 || '',
    forwarding_agent_line3: sli.forwarding_agent_line3 || '',
    forwarding_agent_line4: sli.forwarding_agent_line4 || '',
    in_bond_code: sli.in_bond_code || '',
    instructions_to_forwarder: sli.instructions_to_forwarder || '',
    invoice_number: sli.invoice_number || '',
    company_name: sli.consignee_name || '',
    ship_to_street_line_1: sli.consignee_address_line1 || '',
    ship_to_street_line_2: sli.consignee_address_line2 || '',
    ship_to_city: '',
    ship_to_state: '',
    ship_to_postal_code: '',
    ship_to_country: sli.consignee_country || '',
    products: generatorProducts,
    creation_date: new Date().toISOString().split('T')[0],
  };
}
