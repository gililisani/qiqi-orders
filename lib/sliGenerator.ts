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
  }>;
  
  // Current date
  creation_date: string;
}

// Helper to create checkbox HTML
function checkbox(checked: boolean): string {
  return `<span class="checkbox">${checked ? 'X' : ''}</span>`;
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
  html = html.replace('<td class="w-30">[MANUALLY]</td>', 
    `<td class="w-30">${data.forwarding_agent_line1 || ''}</td>`);
  html = html.replace('<td class="w-30">[MANUALLY]</td>', 
    `<td class="w-30">${data.forwarding_agent_line2 || ''}</td>`);
  html = html.replace('<td class="w-30">[MANUALLY]</td>', 
    `<td class="w-30">${data.forwarding_agent_line3 || ''}</td>`);
  html = html.replace('<td class="w-30">[MANUALLY]</td>', 
    `<td class="w-30">${data.forwarding_agent_line4 || ''}</td>`);
  
  // Date of Export (Box 6)
  html = html.replace('[TO BE FILLED MANUALLY]', today);
  
  // In-Bond Code (Box 17)
  html = html.replace('<td class="w-25">[MANUALLY]</td>', 
    `<td class="w-25">${data.in_bond_code || ''}</td>`);
  
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
  
  // Generate product rows with proper classes
  const productRows = data.products.map(product => {
    const totalWeight = (product.case_qty || 0) * (product.case_weight || 0);
    
    return `            <tr>
              <td class="w-8">D</td>
              <td class="w-18">${product.hs_code || ''}</td>
              <td class="w-10">${product.quantity || 0}</td>
              <td class="w-12">Each</td>
              <td class="w-10">${totalWeight.toFixed(2)}</td>
              <td class="w-10">EAR99</td>
              <td class="w-8"></td>
              <td class="w-12">NLR</td>
              <td class="w-12">$${product.total_price.toFixed(2)}</td>
              <td class="w-10"></td>
            </tr>`;
  }).join('\n');
  
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
  
  // Format checkboxes with proper styling
  // Box 8: Related Party Indicator
  html = html.replace('[CHECKBOX] Related', `${checkbox(false)} Related`);
  html = html.replace('[CHECKBOX] Non-Related', `${checkbox(true)} Non-Related`);
  
  // Box 10: Routed Export Transaction - leave both unchecked
  html = html.replace('[CHECKBOX] Yes', `${checkbox(false)} Yes`);
  html = html.replace('[CHECKBOX] No', `${checkbox(false)} No`);
  
  // Box 12: Ultimate Consignee Type
  html = html.replace('[CHECKBOX] Government Entity', `${checkbox(false)} Government Entity`);
  html = html.replace('[CHECKBOX] Direct Consumer', `${checkbox(false)} Direct Consumer`);
  html = html.replace('[CHECKBOX] Other/Unknown', `${checkbox(false)} Other/Unknown`);
  html = html.replace('[CHECKBOX] Re-Seller', `${checkbox(true)} Re-Seller`);
  
  // Box 16: Hazardous Material
  html = html.replace(/\[CHECKBOX\] Yes \[CHECKBOX\] No/g, 
    `${checkbox(false)} Yes ${checkbox(true)} No`);
  
  // Box 20: TIB/Carnet - both unchecked
  // Box 21: Insurance - both unchecked
  // Box 23: Payment - both unchecked
  // These will be replaced by the generic [CHECKBOX] replacements below
  
  // Replace any remaining [CHECKBOX] with unchecked boxes
  html = html.replace(/\[CHECKBOX\]/g, `${checkbox(false)}`);
  
  // Special cases: Box 40 and 48 should be checked
  html = html.replace('40 <span class="checkbox"></span>', `40 ${checkbox(true)}`);
  html = html.replace('48. <span class="checkbox"></span>', `48. ${checkbox(true)}`);
  
  return html;
}
