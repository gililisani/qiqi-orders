// CSV Export utility for NetSuite integration

export interface OrderForExport {
  id: string;
  created_at: string;
  po_number?: string;
  total_value: number;
  support_fund_used: number;
  credit_earned: number;
  company: {
    company_name: string;
    netsuite_number: string;
    class?: {
      name: string;
    };
    subsidiary?: {
      name: string;
    };
    location?: {
      location_name: string;
    };
  };
  order_items: Array<{
    product: {
      sku: string;
      item_name: string;
      netsuite_name?: string;
    };
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
}

function formatSubsidiary(subsidiaryName?: string): string {
  const name = subsidiaryName || 'Default Subsidiary';
  if (name === 'Qiqi INC.') {
    return 'Qiqi Group : Qiqi Global Ltd. : Qiqi INC.';
  } else {
    return `Qiqi Group : ${name}`;
  }
}

export function generateNetSuiteCSV(order: OrderForExport): string {
  try {
    console.log('CSV Generation - Starting with order:', order.id);
    
    const headers = [
      'External ID',
      'Date',
      'Type',
      'Name',
      'Memo',
      'Rate',
      'PO/Cheque Number',
      'Class',
      'Subsidiary',
      'Location',
      'Item',
      'Quantity',
      'Status',
      'Tax Item'
    ];

    const rows: string[][] = [];
    
    // Generate 6-digit External ID (same for all lines in this CSV)
    const externalId = Math.floor(100000 + Math.random() * 900000).toString();

    // Format date as dd/mm/yyyy
    const orderDate = new Date(order.created_at);
    const formattedDate = `${orderDate.getDate().toString().padStart(2, '0')}/${(orderDate.getMonth() + 1).toString().padStart(2, '0')}/${orderDate.getFullYear()}`;

    // Determine tax item based on subsidiary
    const subsidiaryName = order.company.subsidiary?.name || '';
    console.log('CSV Generation - Raw subsidiary object:', order.company.subsidiary);
    console.log('CSV Generation - Extracted subsidiary name:', `"${subsidiaryName}"`);
    
    // More robust tax item logic
    let taxItem = '';
    if (subsidiaryName.toLowerCase().includes('global')) {
      taxItem = 'ILY – Sales Export';
    } else if (subsidiaryName.toLowerCase().includes('inc')) {
      taxItem = ''; // Empty for Qiqi INC
    } else {
      // Temporary: Force tax item to test if column is working
      taxItem = 'ILY – Sales Export';
    }
    
    // Temporary debug override - force tax item to test column
    if (!taxItem) {
      taxItem = 'TEST-TAX-ITEM';
    }

    console.log('CSV Generation - Processing', order.order_items.length, 'order items');
    console.log('CSV Generation - External ID:', externalId);
    console.log('CSV Generation - Full subsidiary data:', order.company.subsidiary);
    console.log('CSV Generation - Subsidiary name:', subsidiaryName);
    console.log('CSV Generation - Tax Item result:', taxItem);

    // Generate rows for each product
    order.order_items.forEach((item, index) => {
      console.log(`CSV Generation - Processing item ${index + 1}:`, item);
    const row = [
      externalId, // External ID (same for all lines)
      formattedDate, // Date
      'Sales Order', // Type
      `${order.company.netsuite_number} ${order.company.company_name}`, // Name
      '', // Memo (empty for products)
      item.unit_price.toString(), // Rate (price per item)
      order.po_number || '', // PO/Cheque Number
      order.company.class?.name || 'Default Class', // Class
      formatSubsidiary(order.company.subsidiary?.name), // Subsidiary
      order.company.location?.location_name || 'Default Location', // Location
      `${item.product.sku}${item.product.netsuite_name ? ' ' + item.product.netsuite_name : ''}`, // Item
      item.quantity.toString(), // Quantity
      'Pending Fulfillment', // Status
      taxItem // Tax Item
    ];
    
    rows.push(row);
  });

  // Add support fund redemption row if applicable
  if (order.support_fund_used > 0) {
    const supportFundRow = [
      externalId, // External ID (same as products)
      formattedDate, // Date
      'Sales Order', // Type
      `${order.company.netsuite_number} ${order.company.company_name}`, // Name
      'Distributor Support Fund', // Memo
      (-order.support_fund_used).toString(), // Rate (negative support fund amount)
      order.po_number || '', // PO/Cheque Number
      order.company.class?.name || 'Default Class', // Class
      formatSubsidiary(order.company.subsidiary?.name), // Subsidiary
      order.company.location?.location_name || 'Default Location', // Location
      'Partner Discount', // Item
      '1', // Quantity (always 1 for support fund)
      'Pending Fulfillment', // Status
      taxItem // Tax Item
    ];
    
    rows.push(supportFundRow);
  }

  console.log('CSV Generation - Generated', rows.length, 'total rows');

  // Convert to CSV format
  const csvContent = [headers, ...rows]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n');

  console.log('CSV Generation - CSV content generated successfully');
  return csvContent;
  
  } catch (error) {
    console.error('CSV Generation Error:', error);
    throw error;
  }
}

export function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
