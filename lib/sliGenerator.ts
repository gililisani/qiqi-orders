import { readFileSync } from 'fs';
import path from 'path';

interface SLIData {
  // From SLI table
  forwarding_agent_line1: string;
  forwarding_agent_line2: string;
  forwarding_agent_line3: string;
  forwarding_agent_line4: string;
  in_bond_code: string;
  instructions_to_forwarder: string;
  
  // From Order
  invoice_number: string;
  
  // From Company
  company_name: string;
  ship_to_street_line_1: string;
  ship_to_street_line_2: string;
  ship_to_city: string;
  ship_to_state: string;
  ship_to_postal_code: string;
  ship_to_country: string;
  
  // Products array
  products: Array<{
    hs_code: string;
    quantity: number;
    case_qty: number;
    case_weight: number;
    total_price: number;
    made_in: string;
  }>;
  
  // Current date
  creation_date: string;
}

// Helper to create checkbox HTML with label
function checkbox(checked: boolean, label: string = ''): string {
  return `<span style="font-family: Arial, sans-serif; font-size: 20px;">${checked ? '☑' : '☐'}</span> ${label}`;
}

export function generateSLIHTML(data: SLIData): string {
  // Read the HTML template
  const templatePath = path.join(process.cwd(), 'public', 'templates', 'sli-nested-tables.html');
  let html = readFileSync(templatePath, 'utf-8');
  
  // Format today's date
  const today = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  });
  
  // Replace Forwarding Agent (Box 5) - all 4 lines
  html = html.replace('<td class="w-40"></td>', `<td class="w-40">${data.forwarding_agent_line1 || ''}</td>`);
  html = html.replace('<td class="w-40"></td>', `<td class="w-40">${data.forwarding_agent_line2 || ''}</td>`);
  html = html.replace('<td class="w-40"></td>', `<td class="w-40">${data.forwarding_agent_line3 || ''}</td>`);
  html = html.replace('<td class="w-40"></td>', `<td class="w-40">${data.forwarding_agent_line4 || ''}</td>`);
  
  // Date of Export (Box 6)
  html = html.replace('<td class="w-50"></td>', `<td class="w-50">${today}</td>`);
  
  // USPPI Reference (Box 9) - Invoice Number
  html = html.replace('<td class="w-20"></td>', `<td class="w-20">${data.invoice_number || ''}</td>`);
  
  // In-Bond Code (Box 17)
  html = html.replace('<td class="w-15"></td>', `<td class="w-15">${data.in_bond_code || ''}</td>`);
  
  // Ultimate Consignee (Box 11)
  html = html.replace('{name of company from the system}', data.company_name);
  html = html.replace('{address 1 from the system}', data.ship_to_street_line_1 || '');
  html = html.replace('{address 2 from the system}', data.ship_to_street_line_2 || '');
  html = html.replace(
    '{city, state, country, zip code from the system}',
    `${data.ship_to_city}, ${data.ship_to_state}, ${data.ship_to_country}, ${data.ship_to_postal_code}`
  );
  
  // Country of Ultimate Destination (Box 15)
  html = html.replace('{Country from the system}', data.ship_to_country);
  
  // Instructions to Forwarder (Box 26)
  html = html.replace('<div class="text-only">26. Instructions to Forwarder:</div>', 
    `<div class="text-only">26. Instructions to Forwarder:<br>${data.instructions_to_forwarder || ''}</div>`);
  
  // Date (Box 47)
  html = html.replace('[DATE OF THE DOCUMENT]', today);
  
  // Group products by HS code
  // Products with HS code: group and sum
  // Products without HS code: keep separate with N/A
  
  const groupedProducts: Map<string, {
    hs_code: string;
    total_quantity: number;
    total_weight: number;
    total_value: number;
    made_in: string;
  }> = new Map();
  
  const productsWithoutHS: Array<{
    quantity: number;
    weight: number;
    value: number;
    made_in: string;
  }> = [];
  
  data.products.forEach(product => {
    const totalWeight = (product.case_qty || 0) * (product.case_weight || 0);
    
    if (product.hs_code && product.hs_code.trim() !== '') {
      // Has HS code - group it
      const hsCode = product.hs_code.trim();
      
      if (groupedProducts.has(hsCode)) {
        const existing = groupedProducts.get(hsCode)!;
        existing.total_quantity += product.quantity;
        existing.total_weight += totalWeight;
        existing.total_value += product.total_price;
        // Keep the first made_in for the group
      } else {
        groupedProducts.set(hsCode, {
          hs_code: hsCode,
          total_quantity: product.quantity,
          total_weight: totalWeight,
          total_value: product.total_price,
          made_in: product.made_in || '',
        });
      }
    } else {
      // No HS code - keep separate with N/A
      productsWithoutHS.push({
        quantity: product.quantity,
        weight: totalWeight,
        value: product.total_price,
        made_in: product.made_in || '',
      });
    }
  });
  
  // Helper function to format currency with thousand separator
  const formatCurrency = (value: number): string => {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Helper function to determine D/F based on made_in
  const getDorF = (madeIn: string): string => {
    const country = (madeIn || '').toLowerCase().trim();
    if (country === 'usa' || country === 'united states' || country === 'us') {
      return 'D';
    }
    return 'F';
  };

  // Generate rows for products WITH HS code
  const rowsWithHS = Array.from(groupedProducts.values()).map(group => {
    return `            <tr>
              <td class="w-8">${getDorF(group.made_in)}</td>
              <td class="w-18">${group.hs_code}</td>
              <td class="w-10">${group.total_quantity.toLocaleString('en-US')}</td>
              <td class="w-12">Each</td>
              <td class="w-10">${group.total_weight.toFixed(2)} kg</td>
              <td class="w-10">EAR99</td>
              <td class="w-8"></td>
              <td class="w-12">NLR</td>
              <td class="w-12">$${formatCurrency(group.total_value)}</td>
              <td class="w-10"></td>
            </tr>`;
  });
  
  // Generate rows for products WITHOUT HS code (separate rows)
  const rowsWithoutHS = productsWithoutHS.map(product => {
    return `            <tr>
              <td class="w-8">${getDorF(product.made_in)}</td>
              <td class="w-18">N/A</td>
              <td class="w-10">${product.quantity.toLocaleString('en-US')}</td>
              <td class="w-12">Each</td>
              <td class="w-10">${product.weight.toFixed(2)} kg</td>
              <td class="w-10">EAR99</td>
              <td class="w-8"></td>
              <td class="w-12">NLR</td>
              <td class="w-12">$${formatCurrency(product.value)}</td>
              <td class="w-10"></td>
            </tr>`;
  });
  
  // Combine all rows
  const productRows = [...rowsWithHS, ...rowsWithoutHS].join('\n');
  
  // Find and replace the product rows section
  const dummyRowsStart = html.indexOf('<!-- Dummy rows 28-33 -->');
  if (dummyRowsStart !== -1) {
    // Find the end of the dummy rows (look for the next comment or closing tag)
    const nextCommentOrClose = html.indexOf('</table>', dummyRowsStart);
    if (nextCommentOrClose !== -1) {
      const before = html.substring(0, dummyRowsStart);
      const after = html.substring(nextCommentOrClose);
      html = before + productRows + '\n          ' + after;
    }
  }
  
  // Replace all {leave blank} placeholders
  html = html.replace(/{leave blank}/g, '&nbsp;');
  
  // Format checkboxes with proper styling and labels
  
  // Box 16: Hazardous Material - always "No" checked (DO THIS FIRST!)
  const hazmatCell = '16\\. Hazardous Material:</td>\\s*<td class="w-25"[^>]*>\\[CHECKBOX\\] Yes \\[CHECKBOX\\] No';
  html = html.replace(new RegExp(hazmatCell), 
    `16. Hazardous Material:</td><td class="w-25" style="word-spacing: 15px;">${checkbox(false, 'Yes')} ${checkbox(true, 'No')}`);
  
  // Box 8: Related Party Indicator
  html = html.replace('[CHECKBOX] Related', checkbox(false, 'Related'));
  html = html.replace('[CHECKBOX] Non-Related', checkbox(true, 'Non-Related'));
  
  // Box 10: Routed Export Transaction - leave both unchecked
  html = html.replace(/\[CHECKBOX\] Yes/g, checkbox(false, 'Yes'));
  html = html.replace(/\[CHECKBOX\] No/g, checkbox(false, 'No'));
  
  // Box 12: Ultimate Consignee Type
  html = html.replace('[CHECKBOX] Government Entity', checkbox(false, 'Government Entity'));
  html = html.replace('[CHECKBOX] Direct Consumer', checkbox(false, 'Direct Consumer'));
  html = html.replace('[CHECKBOX] Other/Unknown', checkbox(false, 'Other/Unknown'));
  html = html.replace('[CHECKBOX] Re-Seller', checkbox(true, 'Re-Seller'));
  
  // Box 23: Payment
  html = html.replace('[CHECKBOX] Prepaid', checkbox(false, 'Prepaid'));
  html = html.replace('[CHECKBOX] Collect', checkbox(false, 'Collect'));
  html = html.replace('[CHECKBOX] Abandoned', checkbox(false, 'Abandoned'));
  html = html.replace('[CHECKBOX] Return to Shipper', checkbox(false, 'Return to Shipper'));
  
  // Box 24: Deliver To
  html = html.replace('[CHECKBOX] Deliver To:', checkbox(false, 'Deliver To:'));
  
  // Replace any remaining [CHECKBOX] with unchecked boxes (no label)
  html = html.replace(/\[CHECKBOX\]/g, checkbox(false, ''));
  
  // Special cases: Box 40 and 48 should be checked
  html = html.replace(/40 <span class="checkbox-wrapper">.*?<\/span>/g, `40 ${checkbox(true, '')}`);
  html = html.replace(/48\. <span class="checkbox-wrapper">.*?<\/span>/g, `48. ${checkbox(true, '')}`);
  
  return html;
}
