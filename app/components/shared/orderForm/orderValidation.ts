export function validatePerformSave(params: {
  company: unknown;
  orderItemsCount: number;
  supportFundItemsCount: number;
}): string | null {
  if (!params.company) {
    return 'No company selected';
  }

  if (params.orderItemsCount === 0 && params.supportFundItemsCount === 0) {
    return 'Order must contain at least one product';
  }

  return null;
}

