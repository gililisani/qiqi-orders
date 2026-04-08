export type OrderItemInput = {
  product_id: number;
  quantity: number;
  case_qty?: number | null;
  unit_price: number;
  total_price: number;
};

export function generatePoNumber(existing: string | null | undefined): string {
  let poNumber = existing || null;
  if (!poNumber || poNumber.trim() === '') {
    // Generate 6-character alphanumeric PO number
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let generatedPO = '';
    for (let i = 0; i < 6; i++) {
      generatedPO += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    poNumber = generatedPO;
  }
  return poNumber;
}

export function buildOrderItemsInsertData(
  orderId: string | number,
  orderItems: OrderItemInput[],
  supportFundItems: OrderItemInput[]
): Array<{
  order_id: string | number;
  product_id: number;
  quantity: number;
  case_qty: number;
  unit_price: number;
  total_price: number;
  is_support_fund_item: boolean;
  sort_order: number;
}> {
  const regularItemsData = orderItems.map((item, index) => ({
    order_id: orderId,
    product_id: item.product_id,
    quantity: item.quantity,
    case_qty: item.case_qty || 0,
    unit_price: item.unit_price,
    total_price: item.total_price,
    is_support_fund_item: false,
    sort_order: index,
  }));

  const supportFundItemsData = supportFundItems.map((item, index) => ({
    order_id: orderId,
    product_id: item.product_id,
    quantity: item.quantity,
    case_qty: item.case_qty || 0,
    unit_price: item.unit_price,
    total_price: item.total_price,
    is_support_fund_item: true,
    sort_order: orderItems.length + index,
  }));

  return [...regularItemsData, ...supportFundItemsData];
}

export function buildOrderItemsUpdateData(
  orderId: string | number,
  orderItems: OrderItemInput[],
  supportFundItems: OrderItemInput[]
): Array<{
  order_id: string | number;
  product_id: number;
  quantity: number;
  case_qty: number | null | undefined;
  unit_price: number;
  total_price: number;
  is_support_fund_item: boolean;
  sort_order: number;
}> {
  const regularItemsData = orderItems.map((item, index) => ({
    order_id: orderId,
    product_id: item.product_id,
    quantity: item.quantity,
    case_qty: item.case_qty,
    unit_price: item.unit_price,
    total_price: item.total_price,
    is_support_fund_item: false,
    sort_order: index,
  }));

  const supportFundItemsData = supportFundItems.map((item, index) => ({
    order_id: orderId,
    product_id: item.product_id,
    quantity: item.quantity,
    case_qty: item.case_qty,
    unit_price: item.unit_price,
    total_price: item.total_price,
    is_support_fund_item: true,
    sort_order: orderItems.length + index,
  }));

  return [...regularItemsData, ...supportFundItemsData];
}

export function buildAutoSaveDraftBody(params: {
  companyId: string | number;
  userId: string;
  poNumber: string;
  orderItems: OrderItemInput[];
  supportFundItems: OrderItemInput[];
}): {
  orderData: {
    company_id: string | number;
    user_id: string;
    po_number: string;
    status: 'Draft';
  };
  orderItems: Array<{
    product_id: number;
    quantity: number;
    case_qty: number;
    unit_price: number;
    total_price: number;
    is_support_fund_item: false;
    sort_order: number;
  }>;
  supportFundItems: Array<{
    product_id: number;
    quantity: number;
    case_qty: number;
    unit_price: number;
    total_price: number;
    is_support_fund_item: true;
    sort_order: number;
  }>;
} {
  // Keep key ordering identical to call sites (orderData -> orderItems -> supportFundItems).
  return {
    orderData: {
      company_id: params.companyId,
      user_id: params.userId,
      po_number: params.poNumber,
      status: 'Draft',
    },
    orderItems: params.orderItems.map((item, index) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      case_qty: item.case_qty || 0,
      unit_price: item.unit_price,
      total_price: item.total_price,
      is_support_fund_item: false,
      sort_order: index,
    })),
    supportFundItems: params.supportFundItems.map((item, index) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      case_qty: item.case_qty || 0,
      unit_price: item.unit_price,
      total_price: item.total_price,
      is_support_fund_item: true,
      sort_order: params.orderItems.length + index,
    })),
  };
}

