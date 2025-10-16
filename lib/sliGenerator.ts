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
  
  // Replace placeholders with actual data
  
  // Forwarding Agent (Box 5)
  html = html.replace('[MANUALLY]', data.forwarding_agent_line1 || '');
  html = html.replace(/\[MANUALLY\]/g, (match, offset) => {
    // First occurrence is line 1 (already replaced above)
    // Second occurrence is line 2
    // Third occurrence is line 3
    const occurrences = html.substring(0, offset).match(/\[MANUALLY\]/g) || [];
    if (occurrences.length === 0) return data.forwarding_agent_line2 || '';
    if (occurrences.length === 1) return data.forwarding_agent_line3 || '';
    if (occurrences.length === 2) return data.forwarding_agent_line4 || '';
    return match;
  });
  
  // Date of Export (Box 6)
  html = html.replace('[TO BE FILLED MANUALLY]', today);
  
  // USPPI Reference # (Box 9)
  html = html.replace('[MANUALLY]', data.invoice_number || '');
  
  // In-Bond Code (Box 17)
  html = html.replace('[MANUALLY]', data.in_bond_code || '');
  
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
  html = html.replace('26. Instructions to Forwarder:', 
    `26. Instructions to Forwarder:<br>${data.instructions_to_forwarder || ''}`);
  
  // Date (Box 47)
  html = html.replace('[DATE OF THE DOCUMENT]', today);
  
  // Generate product rows
  const productRows = data.products.map(product => {
    const totalWeight = (product.case_qty || 0) * (product.case_weight || 0);
    
    return `
      <tr>
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
      </tr>
    `;
  }).join('\n');
  
  // Replace dummy product rows with actual data
  // Find the product table section and replace dummy rows
  const productTableStart = html.indexOf('<!-- Dummy rows 28-33 -->');
  const productTableEnd = html.indexOf('</table>', productTableStart);
  
  if (productTableStart !== -1 && productTableEnd !== -1) {
    const beforeTable = html.substring(0, productTableStart);
    const afterTable = html.substring(productTableEnd);
    html = beforeTable + productRows + afterTable;
  }
  
  // Replace all {leave blank} placeholders
  html = html.replace(/{leave blank}/g, '');
  
  // Handle checkboxes - mark the fixed ones as checked
  html = html.replace('[CHECKBOX] Non-Related', '☑ Non-Related');
  html = html.replace('[CHECKBOX] Re-Seller', '☑ Re-Seller');
  html = html.replace('[CHECKBOX] Yes [CHECKBOX] No', '☐ Yes ☑ No'); // Hazmat No
  html = html.replace(/\[CHECKBOX\]/g, '☐');
  
  // Mark boxes 40 and 48 as checked
  html = html.replace('40 ☐', '40 ☑');
  html = html.replace('48. ☐', '48. ☑');
  
  return html;
}

