import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';

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

    // Fetch standalone SLI data from the new table
    const { data: sli, error: sliError } = await supabaseAdmin
      .from('standalone_slis')
      .select('*')
      .eq('id', sliId)
      .single();

    if (sliError || !sli) {
      return NextResponse.json({ error: 'SLI not found' }, { status: 404 });
    }

    // Read HTML template
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'sli-nested-tables.html');
    let html = fs.readFileSync(templatePath, 'utf-8');

    // Generate HTML for standalone SLI
    html = await generateStandaloneSLIHTML(html, sli, supabaseAdmin);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });

  } catch (error: any) {
    console.error('Error generating SLI HTML:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate SLI HTML' }, { status: 500 });
  }
}

async function generateStandaloneSLIHTML(html: string, sli: any, supabaseAdmin: any): Promise<string> {
  // Format dates
  const dateOfExport = sli.date_of_export ? new Date(sli.date_of_export).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '';
  const sliDate = sli.sli_date ? new Date(sli.sli_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

  // Replace forwarding agent (using the same pattern as sliGenerator)
  html = html.replace('<td class="w-40"></td>', `<td class="w-40">${sli.forwarding_agent_line1 || ''}</td>`);
  html = html.replace('<td class="w-40"></td>', `<td class="w-40">${sli.forwarding_agent_line2 || ''}</td>`);
  html = html.replace('<td class="w-40"></td>', `<td class="w-40">${sli.forwarding_agent_line3 || ''}</td>`);
  html = html.replace('<td class="w-40"></td>', `<td class="w-40">${sli.forwarding_agent_line4 || ''}</td>`);

  // Replace date of export (Box 6)
  html = html.replace('<td class="w-50"></td>', `<td class="w-50">${dateOfExport}</td>`);

  // Replace invoice number (Box 9)
  html = html.replace('<td class="w-20"></td>', `<td class="w-20">${sli.invoice_number || ''}</td>`);

  // Replace in-bond code (Box 17)
  html = html.replace('<td class="w-15"></td>', `<td class="w-15">${sli.in_bond_code || ''}</td>`);

  // Replace consignee info
  html = html.replace('{name of company from the system}', sli.consignee_name || '');
  html = html.replace('{address 1 from the system}', sli.consignee_address_line1 || '');
  html = html.replace('{address 2 from the system}', sli.consignee_address_line2 || '');
  html = html.replace(
    /{address 3 from the system}/g,
    sli.consignee_address_line3 || ''
  );

  // Replace country (Box 15)
  html = html.replace('{Country from the system}', sli.consignee_country || '');

  // Replace Box 11 city, state, country, zip (4th line after address lines 1-3)
  html = html.replace('{city, state, country, zip code from the system}', ''); // Leave blank for standalone

  // Replace instructions to forwarder (Box 26)
  html = html.replace('<div class="text-only">26. Instructions to Forwarder:</div>', 
    `<div class="text-only">26. Instructions to Forwarder: ${sli.instructions_to_forwarder || ''}</div>`);

  // Replace document date
  html = html.replace('[DATE OF THE DOCUMENT]', sliDate);

  // Replace {leave blank} placeholders
  html = html.replace(/{leave blank}/g, '');

  // Handle products from selected_products - fetch product details and aggregate by HS Code
  // Parse JSONB if it's a string
  let selectedProducts = sli.selected_products || [];
  if (typeof selectedProducts === 'string') {
    try {
      selectedProducts = JSON.parse(selectedProducts);
    } catch (e) {
      console.error('Error parsing selected_products JSON:', e);
      selectedProducts = [];
    }
  }
  
  if (!Array.isArray(selectedProducts) || selectedProducts.length === 0) {
    console.error('No products found in SLI. selected_products:', selectedProducts);
    throw new Error('No products found in SLI');
  }

  // Fetch product details from Products table
  const productIds = selectedProducts
    .map((sp: any) => sp.product_id)
    .filter((id: any) => id); // Filter out any null/undefined IDs

  if (productIds.length === 0) {
    console.error('No valid product IDs found. selectedProducts:', selectedProducts);
    throw new Error('No valid product IDs found in SLI');
  }

  console.log('Fetching products with IDs:', productIds);
  
  const { data: products, error: productsError } = await supabaseAdmin
    .from('Products')
    .select('id, item_name, hs_code, case_weight, made_in, eccn_code, unit_of_measure, price_international')
    .in('id', productIds);

  if (productsError) {
    console.error('Error fetching products:', productsError);
    throw new Error(`Failed to fetch product details: ${productsError.message}`);
  }

  if (!products || products.length === 0) {
    console.error('No products returned from database. Product IDs:', productIds);
    throw new Error(`No products found for IDs: ${productIds.join(', ')}`);
  }

  console.log('Successfully fetched products:', products.length);

  // Type definition for product
  type Product = {
    id: string;
    item_name: string;
    hs_code?: string | null;
    case_weight?: number | null;
    made_in?: string | null;
    eccn_code?: string | null;
    unit_of_measure?: string | null;
    price_international?: number | null;
  };

  const productsMap = new Map<string, Product>(products?.map((p: Product) => [p.id, p]) || []);

  // Prepare products for aggregation (same logic as order-based SLI)
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
    const product = productsMap.get(sp.product_id);
    if (!product) return;

    const quantity = sp.quantity || 0;
    const caseWeight = (product.case_weight ?? 0) as number;
    const price = (product.price_international ?? 0) as number;
    const casePack = 1; // Default case pack for standalone SLIs
    const totalWeight = quantity * caseWeight;
    const totalPrice = quantity * price;

    productsForAggregation.push({
      hs_code: product.hs_code || sp.hs_code || 'N/A',
      quantity: quantity,
      case_qty: quantity, // Use quantity as case_qty for standalone
      case_weight: caseWeight,
      total_price: totalPrice,
      made_in: product.made_in || sp.made_in || '',
      item_name: product.item_name || sp.product_name,
    });
  });

  // Aggregate products by HS Code (same logic as sliGenerator.ts)
  const groupedProducts: Map<string, {
    hs_code: string;
    total_quantity: number;
    total_weight: number;
    total_value: number;
    made_in: string;
    item_names: string[];
  }> = new Map();

  const productsWithoutHS: Array<{
    quantity: number;
    weight: number;
    value: number;
    made_in: string;
    item_name: string;
  }> = [];

  productsForAggregation.forEach(product => {
    const totalWeight = product.case_qty * product.case_weight;
    
    if (product.hs_code && product.hs_code.trim() !== '' && product.hs_code !== 'N/A') {
      // Has HS code - group it
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
      // No HS code - keep separate with N/A
      productsWithoutHS.push({
        quantity: product.quantity,
        weight: totalWeight,
        value: product.total_price,
        made_in: product.made_in || '',
        item_name: product.item_name,
      });
    }
  });

  // Helper function to format currency
  const formatCurrency = (value: number): string => {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Helper function to determine D/F based on made_in
  const getDorF = (madeIn: string): string => {
    const country = (madeIn || '').toLowerCase().trim();
    if (country === 'united states' || country === 'usa' || country === 'us') {
      return 'D';
    }
    return 'F';
  };

  // Generate product rows
  let productRows = '';
  let totalValue = 0;

  // Add grouped products (with HS codes)
  groupedProducts.forEach((group) => {
    const df = getDorF(group.made_in);
    const description = group.item_names.join(', ');
    const formattedQuantity = group.total_quantity.toLocaleString('en-US');
    const formattedWeight = group.total_weight.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedValue = formatCurrency(group.total_value);
    totalValue += group.total_value;

    productRows += `
              <tr>
                <td class="w-8">${df}</td>
                <td class="w-18">${group.hs_code}<br>${description}</td>
                <td class="w-10">${formattedQuantity} Each</td>
                <td class="w-12"></td>
                <td class="w-10">${formattedWeight} kg</td>
                <td class="w-10">EAR99</td>
                <td class="w-8"></td>
                <td class="w-12">NLR</td>
                <td class="w-12">$${formattedValue}</td>
                <td class="w-10"></td>
              </tr>`;
  });

  // Add products without HS codes
  productsWithoutHS.forEach((product) => {
    const df = getDorF(product.made_in);
    const formattedQuantity = product.quantity.toLocaleString('en-US');
    const formattedWeight = product.weight.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedValue = formatCurrency(product.value);
    totalValue += product.value;

    productRows += `
              <tr>
                <td class="w-8">${df}</td>
                <td class="w-18">N/A<br>${product.item_name}</td>
                <td class="w-10">${formattedQuantity} Each</td>
                <td class="w-12"></td>
                <td class="w-10">${formattedWeight} kg</td>
                <td class="w-10">EAR99</td>
                <td class="w-8"></td>
                <td class="w-12">NLR</td>
                <td class="w-12">$${formattedValue}</td>
                <td class="w-10"></td>
              </tr>`;
  });

  // Add total row
  const formattedTotal = formatCurrency(totalValue);
  productRows += `
              <tr>
                <td colspan="8" class="w-100" style="text-align: right; font-weight: bold;">TOTAL:</td>
                <td class="w-12" style="font-weight: bold;">$${formattedTotal}</td>
                <td class="w-10"></td>
              </tr>`;

  // Replace the dummy rows section
  const dummyRowsStart = html.indexOf('<!-- Dummy rows 28-33 -->');
  if (dummyRowsStart !== -1) {
    const nextCommentOrClose = html.indexOf('</table>', dummyRowsStart);
    if (nextCommentOrClose !== -1) {
      const before = html.substring(0, dummyRowsStart);
      const after = html.substring(nextCommentOrClose);
      html = before + productRows + '\n          ' + after;
    }
  }

  // Handle checkboxes
  const checkboxStates = sli.checkbox_states || {};
  
  const checkbox = (isChecked: boolean, label: string = '') => {
    return `<span class="checkbox-wrapper"><span class="checkbox">${isChecked ? 'X' : ''}</span><span class="checkbox-label">${label}</span></span>`;
  };
  
  // Box 8: Related Party
  html = html.replace('[CHECKBOX] Related', checkbox(checkboxStates.related_party_related, 'Related'));
  html = html.replace('[CHECKBOX] Non-Related', checkbox(checkboxStates.related_party_non_related, 'Non-Related'));
  
  // Box 10: Routed Export
  const routedExportCell = /\[CHECKBOX\] Yes \[CHECKBOX\] No/g;
  html = html.replace(routedExportCell, 
    `${checkbox(checkboxStates.routed_export_yes, 'Yes')} ${checkbox(checkboxStates.routed_export_no, 'No')}`);
  
  // Box 12: Type of Consignee
  html = html.replace('[CHECKBOX] Government Entity', checkbox(checkboxStates.consignee_type_government, 'Government Entity'));
  html = html.replace('[CHECKBOX] Direct Consumer', checkbox(checkboxStates.consignee_type_direct_consumer, 'Direct Consumer'));
  html = html.replace('[CHECKBOX] Other/Unknown', checkbox(checkboxStates.consignee_type_other_unknown, 'Other/Unknown'));
  html = html.replace('[CHECKBOX] Re-Seller', checkbox(checkboxStates.consignee_type_reseller, 'Re-Seller'));
  
  // Box 16: Hazardous Material
  const hazmatCell = '<td class="w-25" style="word-spacing: 15px;">[CHECKBOX] Yes [CHECKBOX] No</td>';
  html = html.replace(hazmatCell, 
    `<td class="w-25" style="word-spacing: 15px;">${checkbox(checkboxStates.hazardous_material_yes, 'Yes')} ${checkbox(checkboxStates.hazardous_material_no, 'No')}</td>`);
  
  // Box 21: TIB/Carnet
  const tibCell = '<td class="w-20" style="word-spacing: 15px;">[CHECKBOX] Yes [CHECKBOX] No</td>';
  html = html.replace(tibCell, 
    `<td class="w-20" style="word-spacing: 15px;">${checkbox(checkboxStates.tib_carnet_yes, 'Yes')} ${checkbox(checkboxStates.tib_carnet_no, 'No')}</td>`);
  
  // Box 24: Deliver To
  html = html.replace('[CHECKBOX] Deliver To:', checkbox(checkboxStates.deliver_to_checkbox, 'Deliver To:'));
  
  // Box 39 & 40
  html = html.replace('39 [CHECKBOX]', `39 ${checkbox(false, '')}`);
  html = html.replace('40 [CHECKBOX]', `40 ${checkbox(checkboxStates.declaration_statement_checkbox, '')}`);
  
  // Box 48: Signature
  html = html.replace('48. [CHECKBOX]', `48. ${checkbox(checkboxStates.signature_checkbox, '')}`);

  return html;
}
