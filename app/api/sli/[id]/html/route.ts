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

    // Fetch SLI data (works for both order-based and standalone)
    const { data: sli, error: sliError } = await supabaseAdmin
      .from('slis')
      .select('*')
      .eq('id', sliId)
      .single();

    if (sliError || !sli) {
      return NextResponse.json({ error: 'SLI not found' }, { status: 404 });
    }

    // Read HTML template
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'sli-nested-tables.html');
    let html = fs.readFileSync(templatePath, 'utf-8');

    // Determine if it's order-based or standalone
    if (sli.sli_type === 'standalone') {
      // Handle standalone SLI
      html = await generateStandaloneSLIHTML(html, sli, supabaseAdmin);
    } else {
      // Handle order-based SLI (existing logic)
      html = await generateOrderBasedSLIHTML(html, sli, supabaseAdmin);
    }

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
  // Replace forwarding agent
  html = html.replace('[FORWARDING_AGENT_LINE1]', sli.forwarding_agent_line1 || '');
  html = html.replace('[FORWARDING_AGENT_LINE2]', sli.forwarding_agent_line2 || '');
  html = html.replace('[FORWARDING_AGENT_LINE3]', sli.forwarding_agent_line3 || '');
  html = html.replace('[FORWARDING_AGENT_LINE4]', sli.forwarding_agent_line4 || '');

  // Replace date of export
  const dateOfExport = sli.date_of_export ? new Date(sli.date_of_export).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '';
  html = html.replace('[DATE_OF_EXPORT]', dateOfExport);

  // Replace in-bond code
  html = html.replace('[IN_BOND_CODE]', sli.in_bond_code || '');

  // Replace consignee info
  const consigneeName = sli.consignee_name || '';
  const consigneeAddress = [
    sli.consignee_address_line1,
    sli.consignee_address_line2,
    sli.consignee_address_line3
  ].filter(Boolean).join('<br>');
  
  html = html.replace('[CONSIGNEE_NAME]', consigneeName);
  html = html.replace('[CONSIGNEE_ADDRESS]', consigneeAddress);

  // Replace country
  html = html.replace('[COUNTRY]', sli.consignee_country || '');

  // Replace invoice number
  html = html.replace('[INVOICE_NUMBER]', sli.invoice_number || '');

  // Replace instructions
  html = html.replace('[INSTRUCTIONS_TO_FORWARDER]', sli.instructions_to_forwarder || '');

  // Replace SLI date
  const sliDate = sli.sli_date ? new Date(sli.sli_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  html = html.replace('[DATE]', sliDate);

  // Handle products from manual_products
  const products = sli.manual_products || [];
  let productRows = '';
  let totalValue = 0;

  products.forEach((product: any, index: number) => {
    const df = 'F'; // Default to Foreign for standalone (no Made In info)
    const hsCode = product.hs_code || 'N/A';
    const quantity = parseFloat(product.quantity) || 0;
    const weight = parseFloat(product.weight) || 0;
    const value = parseFloat(product.value) || 0;
    totalValue += value;

    const formattedQuantity = quantity.toLocaleString('en-US');
    const formattedWeight = weight.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedValue = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    productRows += `
      <tr>
        <td style="border: 0.5px solid #000; padding: 4px; text-align: center;">${df}</td>
        <td style="border: 0.5px solid #000; padding: 4px;">${hsCode}</td>
        <td style="border: 0.5px solid #000; padding: 4px; text-align: right;">${formattedQuantity}</td>
        <td style="border: 0.5px solid #000; padding: 4px;">${product.uom || 'Each'}</td>
        <td style="border: 0.5px solid #000; padding: 4px; text-align: right;">${formattedWeight} kg</td>
        <td style="border: 0.5px solid #000; padding: 4px;">${product.eccn || 'EAR99'}</td>
        <td style="border: 0.5px solid #000; padding: 4px;"></td>
        <td style="border: 0.5px solid #000; padding: 4px;">${product.license_symbol || 'NLR'}</td>
        <td style="border: 0.5px solid #000; padding: 4px; text-align: right;">$${formattedValue}</td>
        <td style="border: 0.5px solid #000; padding: 4px;"></td>
      </tr>
    `;
  });

  // Add total row
  const formattedTotal = totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  productRows += `
    <tr>
      <td colspan="8" style="border: 0.5px solid #000; padding: 4px; text-align: right; font-weight: bold;">TOTAL:</td>
      <td style="border: 0.5px solid #000; padding: 4px; text-align: right; font-weight: bold;">$${formattedTotal}</td>
      <td style="border: 0.5px solid #000; padding: 4px;"></td>
    </tr>
  `;

  html = html.replace('[PRODUCT_ROWS]', productRows);

  // Handle checkboxes
  const checkboxStates = sli.checkbox_states || {};
  
  // Box 8: Related Party
  html = html.replace('[CHECKBOX_RELATED]', checkboxStates.related_party_related ? 'X' : '');
  html = html.replace('[CHECKBOX_NON_RELATED]', checkboxStates.related_party_non_related ? 'X' : '');
  
  // Box 10: Routed Export
  html = html.replace('[CHECKBOX_ROUTED_YES]', checkboxStates.routed_export_yes ? 'X' : '');
  html = html.replace('[CHECKBOX_ROUTED_NO]', checkboxStates.routed_export_no ? 'X' : '');
  
  // Box 12: Type of Consignee
  html = html.replace('[CHECKBOX_GOVERNMENT]', checkboxStates.consignee_type_government ? 'X' : '');
  html = html.replace('[CHECKBOX_DIRECT_CONSUMER]', checkboxStates.consignee_type_direct_consumer ? 'X' : '');
  html = html.replace('[CHECKBOX_OTHER_UNKNOWN]', checkboxStates.consignee_type_other_unknown ? 'X' : '');
  html = html.replace('[CHECKBOX_RESELLER]', checkboxStates.consignee_type_reseller ? 'X' : '');
  
  // Box 16: Hazardous Material
  html = html.replace('[CHECKBOX_HAZMAT_YES]', checkboxStates.hazardous_material_yes ? 'X' : '');
  html = html.replace('[CHECKBOX_HAZMAT_NO]', checkboxStates.hazardous_material_no ? 'X' : '');
  
  // Box 21: TIB/Carnet
  html = html.replace('[CHECKBOX_TIB_YES]', checkboxStates.tib_carnet_yes ? 'X' : '');
  html = html.replace('[CHECKBOX_TIB_NO]', checkboxStates.tib_carnet_no ? 'X' : '');
  
  // Box 24: Deliver To
  html = html.replace('[CHECKBOX_DELIVER_TO]', checkboxStates.deliver_to_checkbox ? 'X' : '');
  
  // Box 40: Declaration
  html = html.replace('[CHECKBOX_DECLARATION]', checkboxStates.declaration_statement_checkbox ? 'X' : '');
  
  // Box 48: Signature
  html = html.replace('[CHECKBOX_SIGNATURE]', checkboxStates.signature_checkbox ? 'X' : '');

  return html;
}

async function generateOrderBasedSLIHTML(html: string, sli: any, supabaseAdmin: any): Promise<string> {
  // For order-based SLIs, redirect to the existing order SLI route
  // This is a fallback - order-based SLIs should use /api/orders/[id]/sli/html
  throw new Error('Order-based SLIs should use /api/orders/[orderId]/sli/html route');
}

