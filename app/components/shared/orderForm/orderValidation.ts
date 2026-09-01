import { SHIPMENT_TYPE_CODES } from '../../../../lib/shipmentTypes';

export function validatePerformSave(params: {
  company: unknown;
  orderItemsCount: number;
  supportFundItemsCount: number;
  shipmentType?: string | null;
}): string | null {
  if (!params.company) {
    return 'No company selected';
  }

  if (params.orderItemsCount === 0 && params.supportFundItemsCount === 0) {
    return 'Order must contain at least one product';
  }

  if (!params.shipmentType || !SHIPMENT_TYPE_CODES.includes(params.shipmentType)) {
    return 'Please select a shipment type.';
  }

  return null;
}
