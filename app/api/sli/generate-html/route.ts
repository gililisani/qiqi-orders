import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const sliData = await request.json();

    // Read the HTML template
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'sli-nested-tables.html');
    let html = readFileSync(templatePath, 'utf-8');

    // Generate HTML using the same logic as standalone SLI
    html = await populateTemplate(html, sliData);

    return NextResponse.json({ html });
  } catch (error: any) {
    console.error('Error generating SLI HTML:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate SLI HTML' }, { status: 500 });
  }
}

async function populateTemplate(html: string, sli: any): Promise<string> {
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

  // Handle products from manual_products
  const products = sli.manual_products || [];
  let productRows = '';
  let totalValue = 0;

  products.forEach((product: any) => {
    const df = 'F'; // Default to Foreign for standalone (no Made In info)
    const hsCode = product.hs_code || 'N/A';
    const description = product.description || '';
    const quantity = parseFloat(product.quantity) || 0;
    const weight = parseFloat(product.weight) || 0;
    const value = parseFloat(product.value) || 0;
    totalValue += value;

    const formattedQuantity = quantity.toLocaleString('en-US');
    const formattedWeight = weight.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedValue = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    productRows += `
              <tr>
                <td class="w-8">${df}</td>
                <td class="w-18">${hsCode}<br>${description}</td>
                <td class="w-10">${formattedQuantity} ${product.uom || 'Each'}</td>
                <td class="w-12"></td>
                <td class="w-10">${formattedWeight} kg</td>
                <td class="w-10">${product.eccn || 'EAR99'}</td>
                <td class="w-8"></td>
                <td class="w-12">${product.license_symbol || 'NLR'}</td>
                <td class="w-12">$${formattedValue}</td>
                <td class="w-10"></td>
              </tr>`;
  });

  // Add total row
  const formattedTotal = totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  productRows += `
              <tr>
                <td colspan="8" class="w-100" style="text-align: right; font-weight: bold;">TOTAL:</td>
                <td class="w-12" style="font-weight: bold;">$${formattedTotal}</td>
                <td class="w-10"></td>
              </tr>`;

  // Replace the dummy rows section (same pattern as sliGenerator)
  const dummyRowsStart = html.indexOf('<!-- Dummy rows 28-33 -->');
  if (dummyRowsStart !== -1) {
    const nextCommentOrClose = html.indexOf('</table>', dummyRowsStart);
    if (nextCommentOrClose !== -1) {
      const before = html.substring(0, dummyRowsStart);
      const after = html.substring(nextCommentOrClose);
      html = before + productRows + '\n          ' + after;
    }
  }

  // Handle checkboxes using the same pattern as sliGenerator
  const checkboxStates = sli.checkbox_states || {};
  
  const checkbox = (isChecked: boolean, label: string) => {
    return `<span style="font-family: Arial, sans-serif; font-size: 20px;">${isChecked ? '☑' : '☐'}</span> ${label}`;
  };
  
  // Box 8: Related Party
  html = html.replace('[CHECKBOX] Related', checkbox(checkboxStates.related_party_related, 'Related'));
  html = html.replace('[CHECKBOX] Non-Related', checkbox(checkboxStates.related_party_non_related, 'Non-Related'));
  
  // Box 10: Routed Export (handle "Yes" and "No" together)
  const routedExportCell = /\[CHECKBOX\] Yes \[CHECKBOX\] No/g;
  html = html.replace(routedExportCell, 
    `${checkbox(checkboxStates.routed_export_yes, 'Yes')} ${checkbox(checkboxStates.routed_export_no, 'No')}`);
  
  // Box 12: Type of Consignee
  html = html.replace('[CHECKBOX] Government Entity', checkbox(checkboxStates.consignee_type_government, 'Government Entity'));
  html = html.replace('[CHECKBOX] Direct Consumer', checkbox(checkboxStates.consignee_type_direct_consumer, 'Direct Consumer'));
  html = html.replace('[CHECKBOX] Other/Unknown', checkbox(checkboxStates.consignee_type_other_unknown, 'Other/Unknown'));
  html = html.replace('[CHECKBOX] Re-Seller', checkbox(checkboxStates.consignee_type_reseller, 'Re-Seller'));
  
  // Box 16: Hazardous Material - always check "No"
  const hazmatCell = '<td class="w-25" style="word-spacing: 15px;">[CHECKBOX] Yes [CHECKBOX] No</td>';
  html = html.replace(hazmatCell, 
    `<td class="w-25" style="word-spacing: 15px;">${checkbox(checkboxStates.hazardous_material_yes, 'Yes')} ${checkbox(checkboxStates.hazardous_material_no, 'No')}</td>`);
  
  // Box 21: TIB/Carnet
  const tibCell = '<td class="w-20" style="word-spacing: 15px;">[CHECKBOX] Yes [CHECKBOX] No</td>';
  html = html.replace(tibCell, 
    `<td class="w-20" style="word-spacing: 15px;">${checkbox(checkboxStates.tib_carnet_yes, 'Yes')} ${checkbox(checkboxStates.tib_carnet_no, 'No')}</td>`);
  
  // Box 23: Shipper Must Check
  html = html.replace('[CHECKBOX] Prepaid [CHECKBOX] Collect', 
    `${checkbox(checkboxStates.prepaid, 'Prepaid')} ${checkbox(checkboxStates.collect, 'Collect')}`);
  html = html.replace('[CHECKBOX] Abandoned', checkbox(checkboxStates.abandoned, 'Abandoned'));
  html = html.replace('[CHECKBOX] Return to Shipper', checkbox(checkboxStates.return_to_shipper, 'Return to Shipper'));
  
  // Box 24: Deliver To
  html = html.replace('[CHECKBOX] Deliver To:', checkbox(checkboxStates.deliver_to_checkbox, 'Deliver To:'));
  
  // Box 39 & 40
  html = html.replace('39 [CHECKBOX]', `39 ${checkbox(false, '')}`);
  html = html.replace('40 [CHECKBOX]', `40 ${checkbox(checkboxStates.declaration_statement_checkbox, '')}`);
  
  // Box 48: Signature
  html = html.replace('48. [CHECKBOX]', `48. ${checkbox(checkboxStates.signature_checkbox, '')}`);

  return html;
}

