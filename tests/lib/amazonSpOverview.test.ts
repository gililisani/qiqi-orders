import { describe, it, expect } from 'vitest';
import {
  summarizeFinancialEvents,
  parseReturnsReportRows,
  matchRefundsToReturns,
  feeLabel,
} from '@/lib/amazonSp/overview';
import { parseTsv, normalizeSellerSku } from '@/lib/amazonSp/client';

const money = (n: number) => ({ CurrencyAmount: n, CurrencyCode: 'USD' });

const EVENTS = {
  ShipmentEventList: [
    {
      AmazonOrderId: '111-A',
      PostedDate: '2026-07-10T12:00:00Z',
      ShipmentItemList: [
        {
          SellerSKU: 'FPS0030-FBA',
          QuantityShipped: 2,
          ItemChargeList: [{ ChargeType: 'Principal', ChargeAmount: money(128) }],
          ItemFeeList: [
            { FeeType: 'Commission', FeeAmount: money(-19.2) },
            { FeeType: 'FBAPerUnitFulfillmentFee', FeeAmount: money(-10.1) },
          ],
          PromotionList: [{ PromotionType: 'Principal', PromotionAmount: money(-5) }],
        },
      ],
    },
    {
      AmazonOrderId: '111-B',
      PostedDate: '2026-07-11T12:00:00Z',
      ShipmentItemList: [
        {
          SellerSKU: 'FPS0027-FBA',
          QuantityShipped: 1,
          ItemChargeList: [{ ChargeType: 'Principal', ChargeAmount: money(40) }],
          ItemFeeList: [{ FeeType: 'Commission', FeeAmount: money(-6) }],
        },
      ],
    },
  ],
  RefundEventList: [
    {
      AmazonOrderId: '111-C',
      PostedDate: '2026-07-15T12:00:00Z',
      ShipmentItemAdjustmentList: [
        {
          SellerSKU: 'FPS0030-FBA',
          ItemChargeAdjustmentList: [
            { ChargeType: 'Principal', ChargeAmount: money(-64) },
            // marketplace-facilitator tax reversal — must be ignored
            { ChargeType: 'Tax', ChargeAmount: money(-5.6) },
          ],
          ItemFeeAdjustmentList: [{ FeeType: 'Commission', FeeAmount: money(7.68) }],
        },
      ],
    },
  ],
  ServiceFeeEventList: [
    { FeeReason: 'Subscription', FeeList: [{ FeeType: 'Subscription', FeeAmount: money(-39.99) }] },
    { FeeList: [{ FeeType: 'FBAInboundTransportationFee', FeeAmount: money(-31.49) }] },
  ],
  AdjustmentEventList: [
    {
      AdjustmentType: 'REVERSAL_REIMBURSEMENT',
      PostedDate: '2026-07-20T12:00:00Z',
      AdjustmentAmount: money(23.68),
      AdjustmentItemList: [
        { SellerSKU: 'FPS0030-FBA', Quantity: '1', TotalAmount: money(23.68), ProductDescription: 'Hair Masque' },
      ],
    },
  ],
  ChargebackEventList: [{ AmazonOrderId: '111-Z' }],
};

describe('summarizeFinancialEvents', () => {
  const s = summarizeFinancialEvents(EVENTS as any);

  it('computes gross sales, units, and seller-funded promotions', () => {
    expect(s.grossSales).toBe(168);
    expect(s.unitsShipped).toBe(3);
    expect(s.shipmentCount).toBe(2);
    expect(s.promotions).toBe(5);
  });

  it('aggregates fees by type, net of refund give-backs', () => {
    const commission = s.feeBuckets.find((b) => b.feeType === 'Commission');
    // 19.20 + 6.00 − 7.68 give-back = 17.52
    expect(commission?.amount).toBe(17.52);
    expect(s.feeBuckets.find((b) => b.feeType === 'Subscription')?.amount).toBe(39.99);
    expect(s.feeBuckets.find((b) => b.feeType === 'FBAInboundTransportationFee')?.amount).toBe(31.49);
    expect(s.feeTotal).toBe(round2(17.52 + 10.1 + 39.99 + 31.49));
  });

  it('summarizes refunds with product portion and fee give-back', () => {
    expect(s.refunds).toHaveLength(1);
    expect(s.refunds[0].orderId).toBe('111-C');
    expect(s.refunds[0].productRefund).toBe(64);
    expect(s.refunds[0].feeGiveback).toBe(7.68);
    expect(s.refundTotal).toBe(64);
  });

  it('extracts reimbursements with type, SKU, and amount', () => {
    expect(s.reimbursements).toHaveLength(1);
    expect(s.reimbursements[0]).toMatchObject({
      type: 'REVERSAL_REIMBURSEMENT',
      sku: 'FPS0030-FBA',
      quantity: 1,
      amount: 23.68,
    });
    expect(s.reimbursementTotal).toBe(23.68);
  });

  it('surfaces unrecognized event lists instead of dropping them', () => {
    expect(s.otherEvents).toEqual([{ list: 'ChargebackEventList', count: 1 }]);
  });

  it('nets Amazon-funded promos against the charges they offset (free shipping)', () => {
    const freeShipping = summarizeFinancialEvents({
      ShipmentEventList: [
        {
          AmazonOrderId: '111-X',
          ShipmentItemList: [
            {
              SellerSKU: 'FPS0029-FBA',
              QuantityShipped: 1,
              ItemChargeList: [
                { ChargeType: 'Principal', ChargeAmount: money(28) },
                { ChargeType: 'Tax', ChargeAmount: money(2.45) }, // remitted by Amazon — ignored
                { ChargeType: 'ShippingCharge', ChargeAmount: money(2.99) },
              ],
              ItemFeeList: [{ FeeType: 'Commission', FeeAmount: money(-4.2) }],
              PromotionList: [
                { PromotionType: 'PromotionMetaDataDefinitionValue', PromotionAmount: money(-2.99) },
              ],
            },
          ],
        },
      ],
    } as any);
    expect(freeShipping.grossSales).toBe(28);
    expect(freeShipping.promotions).toBe(0); // -2.99 promo + 2.99 shipping = wash
  });

  function round2(n: number) {
    return Math.round(n * 100) / 100;
  }
});

describe('returns report parsing + refund matching', () => {
  const TSV = [
    'return-date\torder-id\tsku\tproduct-name\tquantity\tfulfillment-center-id\tdetailed-disposition\treason\tstatus\tcustomer-comments',
    '2026-07-16\t111-C\tFPS0030-FBA\tHair Masque\t1\tLAS1\tSELLABLE\tUNWANTED_ITEM\tUnit returned to inventory\t',
    '2026-07-18\t111-D\tFPS0027-FBA\tShampoo\t1\tLAS1\tCUSTOMER_DAMAGED\tDAMAGED_BY_CUSTOMER\t\tleaked',
  ].join('\n');

  it('parses the TSV into typed rows', () => {
    const rows = parseReturnsReportRows(parseTsv(TSV));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ orderId: '111-C', disposition: 'SELLABLE', quantity: 1 });
    expect(rows[1].customerComments).toBe('leaked');
  });

  it('matches refunds to returns by order id and classifies the outcome', () => {
    const returns = parseReturnsReportRows(parseTsv(TSV));
    const refunds = [
      { orderId: '111-C', postedDate: '', skus: ['FPS0030-FBA'], productRefund: 64, feeGiveback: 7.68 },
      { orderId: '111-E', postedDate: '', skus: ['FPS0026-FBA'], productRefund: 48, feeGiveback: 5.76 },
    ];
    const matched = matchRefundsToReturns(refunds, returns);
    expect(matched[0].returnStatus).toBe('returned-sellable');
    expect(matched[0].returns).toHaveLength(1);
    expect(matched[1].returnStatus).toBe('no-return');
  });
});

describe('helpers', () => {
  it('labels fee codes and normalizes seller SKUs', () => {
    expect(feeLabel('FBAPerUnitFulfillmentFee')).toBe('FBA fulfillment fee');
    expect(feeLabel('SomeNewFeeType')).toBe('Some New Fee Type');
    expect(normalizeSellerSku('FPS0030-FBA')).toBe('FPS0030');
    expect(normalizeSellerSku('KIT0031')).toBe('KIT0031');
  });
});
