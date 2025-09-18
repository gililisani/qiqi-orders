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
      netsuite_itemid?: string;
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
  const headers = [
    'External ID',
    'Date',
    'Type',
    'Name',
    'Memo',
    'Amount',
    'PO/Cheque Number',
    'Class',
    'Subsidiary',
    'Location',
    'Item',
    'Quantity',
    'Status'
  ];

  const rows: string[][] = [];
  let externalIdCounter = 1;

  // Format date as dd/mm/yyyy
  const orderDate = new Date(order.created_at);
  const formattedDate = `${orderDate.getDate().toString().padStart(2, '0')}/${(orderDate.getMonth() + 1).toString().padStart(2, '0')}/${orderDate.getFullYear()}`;

  // Generate rows for each product
  order.order_items.forEach((item) => {
    const row = [
      `Qiqi${externalIdCounter}`, // External ID
      formattedDate, // Date
      'Sales Order', // Type
      `${order.company.netsuite_number} ${order.company.company_name}`, // Name
      '', // Memo (to be handled later)
      item.total_price.toString(), // Amount
      order.po_number || '', // PO/Cheque Number
      order.company.class?.name || 'Default Class', // Class
      formatSubsidiary(order.company.subsidiary?.name), // Subsidiary
      order.company.location?.location_name || 'Default Location', // Location
      `${item.product.sku}${item.product.netsuite_itemid ? ' ' + item.product.netsuite_itemid : ''}`, // Item
      item.quantity.toString(), // Quantity
      'Pending Fulfillment' // Status
    ];
    
    rows.push(row);
    externalIdCounter++;
  });

  // Add support fund redemption row if applicable
  if (order.support_fund_used > 0) {
    const supportFundRow = [
      `Qiqi${externalIdCounter}`, // External ID
      formattedDate, // Date
      'Sales Order', // Type
      `${order.company.netsuite_number} ${order.company.company_name}`, // Name
      'Distributor Support Fund', // Memo
      (-order.support_fund_used).toString(), // Amount (negative)
      order.po_number || '', // PO/Cheque Number
      order.company.class?.name || 'Default Class', // Class
      formatSubsidiary(order.company.subsidiary?.name), // Subsidiary
      order.company.location?.location_name || 'Default Location', // Location
      'Partner Discount', // Item
      '', // Quantity (empty for support fund)
      'Pending Fulfillment' // Status
    ];
    
    rows.push(supportFundRow);
  }

  // Convert to CSV format
  const csvContent = [headers, ...rows]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n');

  return csvContent;
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
