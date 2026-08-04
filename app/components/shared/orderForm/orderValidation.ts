import { PACKING_FOR_OPTIONS } from '../../../../lib/orderSave';

export function validatePerformSave(params: {
  company: unknown;
  orderItemsCount: number;
  supportFundItemsCount: number;
  packingFor?: string | null;
}): string | null {
  if (!params.company) {
    return 'No company selected';
  }

  if (params.orderItemsCount === 0 && params.supportFundItemsCount === 0) {
    return 'Order must contain at least one product';
  }

  if (
    !params.packingFor ||
    !(PACKING_FOR_OPTIONS as readonly string[]).includes(params.packingFor)
  ) {
    return 'Please select what the order is packed for (Air or Ocean shipping).';
  }

  return null;
}

