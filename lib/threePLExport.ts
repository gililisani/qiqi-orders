/**
 * 3PL XLSX Export Utility
 * 
 * Generates XLSX files for 3PL warehouse system upload
 */

import * as XLSX from 'xlsx';

export interface OrderFor3PLExport {
  id: string;
  so_number: string;
  created_at: string;
  company: {
    company_name: string;
    ship_to_contact_name?: string;
    ship_to_contact_email?: string;
    ship_to_contact_phone?: string;
    ship_to_street_line_1?: string;
    ship_to_street_line_2?: string;
    ship_to_city?: string;
    ship_to_state?: string;
    ship_to_postal_code?: string;
    ship_to_country?: string;
  };
  order_items: Array<{
    product: {
      sku: string;
    };
    quantity: number;
    unit_price: number;
  }>;
}

/**
 * Parse contact name into first and last name
 */
function parseContactName(fullName?: string): { firstName: string; lastName: string } {
  if (!fullName || !fullName.trim()) {
    return { firstName: '', lastName: '' };
  }

  const nameParts = fullName.trim().split(/\s+/);
  
  if (nameParts.length === 1) {
    return { firstName: nameParts[0], lastName: '' };
  }
  
  return {
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(' ')
  };
}

/**
 * Format date as MM/DD/YY
 */
function formatDateFor3PL(dateString: string): string {
  const date = new Date(dateString);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  return `${month}/${day}/${year}`;
}

/**
 * Generate 3PL XLSX file
 */
export function generate3PLXLSX(order: OrderFor3PLExport): ArrayBuffer {
  try {
    console.log('[3PL Export] Generating XLSX for order:', order.id);

    // Parse contact name
    const { firstName, lastName } = parseContactName(order.company.ship_to_contact_name);
    
    // Format order date
    const orderDate = formatDateFor3PL(order.created_at);

    // Build rows - one row per order item
    const rows = order.order_items.map((item) => ({
      'Warehouse': 'Packable',
      'Order ID': order.so_number || '',
      'ISMARKETPLACEPREPORDER': '',
      'Order Date': orderDate,
      'Ship By Date': '',
      'Business Name': order.company.company_name || '',
      'Customer First Name': firstName,
      'Customer Last Name': lastName,
      'Street Line 1': order.company.ship_to_street_line_1 || '',
      'Street Line 2': order.company.ship_to_street_line_2 || '',
      'City': order.company.ship_to_city || '',
      'State': order.company.ship_to_state || '',
      'Postal Code': order.company.ship_to_postal_code || '',
      'Country': order.company.ship_to_country || '',
      'Phone #': order.company.ship_to_contact_phone || '',
      'Email': order.company.ship_to_contact_email || '',
      'Product ID / SKU': item.product.sku || '',
      'Quantity': item.quantity,
      'Shipping Carrier': 'Generic',
      'Shipping Method': 'Generic',
      'Lock Shipping': 'TRUE',
      'Price': item.unit_price,
      'Notes': ''
    }));

    console.log('[3PL Export] Generated', rows.length, 'rows');

    // Create worksheet from rows
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Order');

    // Generate XLSX file as array buffer
    const xlsxBuffer = XLSX.write(workbook, { 
      bookType: 'xlsx', 
      type: 'array',
      compression: true
    });

    console.log('[3PL Export] XLSX generated successfully');

    return xlsxBuffer;

  } catch (error) {
    console.error('[3PL Export] Error generating XLSX:', error);
    throw error;
  }
}

/**
 * Download XLSX file to browser
 */
export function download3PLXLSX(xlsxBuffer: ArrayBuffer, fileName: string): void {
  const blob = new Blob([xlsxBuffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.URL.revokeObjectURL(url);
}

