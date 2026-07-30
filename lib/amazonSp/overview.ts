/**
 * Turns raw SP-API financial events into the dashboard's summaries:
 * fee buckets by type, refunds, reimbursements (with reasons), seller-funded
 * promotions, and finance-derived gross sales. Pure functions — unit tested.
 */

import type { FinancialEvents } from './client';

const round2 = (n: number) => Math.round(n * 100) / 100;
const amt = (a: any): number => Number(a?.CurrencyAmount) || 0;

export interface FeeBucket {
  feeType: string;
  amount: number; // positive = cost to us (net of refund give-backs)
  count: number;
}

export interface RefundRow {
  orderId: string;
  postedDate: string;
  skus: string[];
  productRefund: number; // positive = money returned to buyer (product portion)
  feeGiveback: number; // positive = fees Amazon returned to us
}

export interface ReimbursementRow {
  postedDate: string;
  type: string;
  sku: string;
  description: string;
  quantity: number;
  amount: number;
}

export interface FinanceOverview {
  grossSales: number; // sum of shipment principal charges
  unitsShipped: number;
  shipmentCount: number;
  promotions: number; // seller-funded promo discounts (positive number)
  feeBuckets: FeeBucket[];
  feeTotal: number;
  refunds: RefundRow[];
  refundTotal: number; // positive total refunded (product portion)
  reimbursements: ReimbursementRow[];
  reimbursementTotal: number;
  otherEvents: { list: string; count: number }[]; // event lists we don't itemize
}

/** Friendlier labels for Amazon's fee type codes. */
const FEE_LABELS: Record<string, string> = {
  Commission: 'Referral fee (commission)',
  FBAPerUnitFulfillmentFee: 'FBA fulfillment fee',
  RefundCommission: 'Refund administration fee',
  FBAStorageFee: 'FBA storage fee',
  StorageFee: 'FBA storage fee',
  Subscription: 'Subscription fee',
  FBAInboundTransportationFee: 'Inbound transportation fee',
  FBADisposalFee: 'FBA disposal fee',
  FBARemovalFee: 'FBA removal fee',
  DigitalServicesFee: 'Digital services fee',
};

export function feeLabel(code: string): string {
  return FEE_LABELS[code] || code.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function summarizeFinancialEvents(events: FinancialEvents): FinanceOverview {
  const buckets = new Map<string, { amount: number; count: number }>();
  const addFee = (type: string, amount: number) => {
    if (!type || amount === 0) return;
    const b = buckets.get(type) || { amount: 0, count: 0 };
    b.amount = round2(b.amount + amount);
    b.count += 1;
    buckets.set(type, b);
  };

  let grossSales = 0;
  let unitsShipped = 0;
  let promotions = 0;
  const shipments = events.ShipmentEventList || [];
  for (const shipment of shipments) {
    for (const item of shipment.ShipmentItemList || []) {
      unitsShipped += Number(item.QuantityShipped) || 0;
      for (const charge of item.ItemChargeList || []) {
        if (charge.ChargeType === 'Principal') grossSales = round2(grossSales + amt(charge.ChargeAmount));
      }
      // ItemFeeList amounts are negative (what Amazon takes) — flip to cost.
      for (const fee of item.ItemFeeList || []) {
        addFee(fee.FeeType, -amt(fee.FeeAmount));
      }
      // Promotions on the principal are seller-funded discounts (negative).
      for (const promo of item.PromotionList || []) {
        promotions = round2(promotions + -amt(promo.PromotionAmount));
      }
    }
  }

  // Refunds: product portion + fee give-backs (which net the fee buckets).
  const refunds: RefundRow[] = [];
  let refundTotal = 0;
  for (const refund of events.RefundEventList || []) {
    let productRefund = 0;
    let feeGiveback = 0;
    const skus = new Set<string>();
    for (const item of refund.ShipmentItemAdjustmentList || []) {
      if (item.SellerSKU) skus.add(item.SellerSKU);
      for (const charge of item.ItemChargeAdjustmentList || []) {
        // negative = money going back to the buyer
        productRefund = round2(productRefund + -amt(charge.ChargeAmount));
      }
      for (const fee of item.ItemFeeAdjustmentList || []) {
        // positive = Amazon returning part of its fee — net into buckets
        const giveback = amt(fee.FeeAmount);
        feeGiveback = round2(feeGiveback + giveback);
        addFee(fee.FeeType, -giveback);
      }
      for (const promo of item.PromotionAdjustmentList || []) {
        productRefund = round2(productRefund + -amt(promo.PromotionAmount));
      }
    }
    refundTotal = round2(refundTotal + productRefund);
    refunds.push({
      orderId: refund.AmazonOrderId || '',
      postedDate: refund.PostedDate || '',
      skus: [...skus],
      productRefund,
      feeGiveback,
    });
  }

  // Service fees (subscription, storage, inbound, removal…)
  for (const event of events.ServiceFeeEventList || []) {
    for (const fee of event.FeeList || []) {
      addFee(fee.FeeType || event.FeeReason || 'Service fee', -amt(fee.FeeAmount));
    }
  }

  // Adjustments = reimbursements (and occasional other corrections)
  const reimbursements: ReimbursementRow[] = [];
  let reimbursementTotal = 0;
  for (const adj of events.AdjustmentEventList || []) {
    const total = amt(adj.AdjustmentAmount);
    reimbursementTotal = round2(reimbursementTotal + total);
    const items = adj.AdjustmentItemList || [];
    if (items.length === 0) {
      reimbursements.push({
        postedDate: adj.PostedDate || '',
        type: adj.AdjustmentType || 'Adjustment',
        sku: '',
        description: '',
        quantity: 0,
        amount: total,
      });
    }
    for (const item of items) {
      reimbursements.push({
        postedDate: adj.PostedDate || '',
        type: adj.AdjustmentType || 'Adjustment',
        sku: item.SellerSKU || item.FnSKU || '',
        description: item.ProductDescription || '',
        quantity: Number(item.Quantity) || 0,
        amount: items.length === 1 ? total : round2(Number(item.TotalAmount?.CurrencyAmount) || 0),
      });
    }
  }

  // Anything else — surface counts so nothing disappears silently.
  const KNOWN = new Set([
    'ShipmentEventList',
    'RefundEventList',
    'ServiceFeeEventList',
    'AdjustmentEventList',
  ]);
  const otherEvents = Object.entries(events)
    .filter(([key, list]) => !KNOWN.has(key) && Array.isArray(list) && list.length > 0)
    .map(([key, list]) => ({ list: key, count: (list as any[]).length }));

  const feeBuckets: FeeBucket[] = [...buckets.entries()]
    .map(([feeType, b]) => ({ feeType, amount: b.amount, count: b.count }))
    .sort((a, b) => b.amount - a.amount);

  return {
    grossSales,
    unitsShipped,
    shipmentCount: shipments.length,
    promotions,
    feeBuckets,
    feeTotal: round2(feeBuckets.reduce((s, b) => s + b.amount, 0)),
    refunds,
    refundTotal,
    reimbursements,
    reimbursementTotal,
    otherEvents,
  };
}

// ---------------------------------------------------------------------------
// Returns report ↔ refunds matching
// ---------------------------------------------------------------------------
export interface ReturnRow {
  returnDate: string;
  orderId: string;
  sku: string;
  productName: string;
  quantity: number;
  disposition: string; // SELLABLE / CUSTOMER_DAMAGED / DEFECTIVE / CARRIER_DAMAGED …
  reason: string;
  status: string;
  customerComments: string;
}

export function parseReturnsReportRows(rows: Record<string, string>[]): ReturnRow[] {
  return rows.map((r) => ({
    returnDate: r['return-date'] || '',
    orderId: r['order-id'] || '',
    sku: r['sku'] || '',
    productName: r['product-name'] || '',
    quantity: Number(r['quantity']) || 0,
    disposition: r['detailed-disposition'] || '',
    reason: r['reason'] || '',
    status: r['status'] || '',
    customerComments: r['customer-comments'] || '',
  }));
}

export interface ReimbursementReportRow {
  approvalDate: string;
  reimbursementId: string;
  caseId: string;
  orderId: string;
  reason: string; // Lost_warehouse / Damaged_warehouse / CustomerReturn / …
  sku: string;
  productName: string;
  condition: string;
  amountTotal: number;
  quantityCash: number; // units reimbursed with money
  quantityInventory: number; // units reimbursed by replacement stock
}

export function parseReimbursementsReportRows(rows: Record<string, string>[]): ReimbursementReportRow[] {
  return rows.map((r) => ({
    approvalDate: r['approval-date'] || '',
    reimbursementId: r['reimbursement-id'] || '',
    caseId: r['case-id'] || '',
    orderId: r['amazon-order-id'] || '',
    reason: r['reason'] || '',
    sku: r['sku'] || '',
    productName: r['product-name'] || '',
    condition: r['condition'] || '',
    amountTotal: Number(r['amount-total']) || 0,
    quantityCash: Number(r['quantity-reimbursed-cash']) || 0,
    quantityInventory: Number(r['quantity-reimbursed-inventory']) || 0,
  }));
}

export interface RefundWithReturn extends RefundRow {
  returns: ReturnRow[];
  returnStatus: 'returned-sellable' | 'returned-unsellable' | 'partial' | 'no-return';
}

/** Match each refund to the returns report by Amazon order ID. */
export function matchRefundsToReturns(
  refunds: RefundRow[],
  returns: ReturnRow[]
): RefundWithReturn[] {
  const byOrder = new Map<string, ReturnRow[]>();
  for (const ret of returns) {
    if (!byOrder.has(ret.orderId)) byOrder.set(ret.orderId, []);
    byOrder.get(ret.orderId)!.push(ret);
  }
  return refunds.map((refund) => {
    const matched = byOrder.get(refund.orderId) || [];
    let returnStatus: RefundWithReturn['returnStatus'];
    if (matched.length === 0) returnStatus = 'no-return';
    else if (matched.every((r) => r.disposition.toUpperCase() === 'SELLABLE')) returnStatus = 'returned-sellable';
    else if (matched.every((r) => r.disposition.toUpperCase() !== 'SELLABLE')) returnStatus = 'returned-unsellable';
    else returnStatus = 'partial';
    return { ...refund, returns: matched, returnStatus };
  });
}
