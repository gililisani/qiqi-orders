import { describe, it, expect } from 'vitest';
import { buildMonthPreviewFromEvents } from '@/lib/amazonFba/buildFromAmazon';
import { validatePushInput } from '@/lib/amazonFba/pushToNetSuite';

const money = (n: number) => ({ CurrencyAmount: n, CurrencyCode: 'USD' });

const SKU_MAP = new Map([
  ['FPS0030-FBA', { nsItemId: '301', nsItemName: 'Hair Masque' }],
  ['FPS0027-FBA', { nsItemId: '302', nsItemName: 'Shampoo' }],
]);

const EVENTS = {
  ShipmentEventList: [
    {
      AmazonOrderId: '111-A',
      PostedDate: '2026-06-10T12:00:00Z',
      ShipmentItemList: [
        {
          SellerSKU: 'FPS0030-FBA',
          QuantityShipped: 2,
          ItemChargeList: [{ ChargeType: 'Principal', ChargeAmount: money(128) }],
          ItemFeeList: [{ FeeType: 'Commission', FeeAmount: money(-19.2) }],
          PromotionList: [{ PromotionType: 'Principal', PromotionAmount: money(-5) }],
        },
        {
          SellerSKU: 'FPS0027-FBA',
          QuantityShipped: 1,
          ItemChargeList: [{ ChargeType: 'Principal', ChargeAmount: money(40) }],
          ItemFeeList: [{ FeeType: 'FBAPerUnitFulfillmentFee', FeeAmount: money(-5.05) }],
        },
      ],
    },
    {
      AmazonOrderId: '111-B',
      PostedDate: '2026-06-12T12:00:00Z',
      ShipmentItemList: [
        {
          SellerSKU: 'MYSTERY-SKU',
          QuantityShipped: 1,
          ItemChargeList: [{ ChargeType: 'Principal', ChargeAmount: money(30) }],
          ItemFeeList: [],
        },
        {
          // zero-charge giveaway — skipped, like the CSV flow
          SellerSKU: 'FPS0030-FBA',
          QuantityShipped: 1,
          ItemChargeList: [{ ChargeType: 'Principal', ChargeAmount: money(0) }],
        },
      ],
    },
  ],
  RefundEventList: [
    {
      AmazonOrderId: '111-C',
      PostedDate: '2026-06-20T12:00:00Z',
      ShipmentItemAdjustmentList: [
        {
          SellerSKU: 'FPS0030-FBA',
          ItemChargeAdjustmentList: [{ ChargeType: 'Principal', ChargeAmount: money(-64) }],
          ItemFeeAdjustmentList: [{ FeeType: 'Commission', FeeAmount: money(7.68) }],
        },
      ],
    },
  ],
  ServiceFeeEventList: [
    { FeeList: [{ FeeType: 'Subscription', FeeAmount: money(-39.99) }] },
  ],
  AdjustmentEventList: [
    { AdjustmentType: 'REVERSAL_REIMBURSEMENT', AdjustmentAmount: money(23.68), AdjustmentItemList: [] },
  ],
};

describe('buildMonthPreviewFromEvents', () => {
  const preview = buildMonthPreviewFromEvents('2026-06', EVENTS as any, SKU_MAP);

  it('builds sale lines with exact quantities and full-precision rates', () => {
    expect(preview.saleLines).toHaveLength(2);
    const masque = preview.saleLines.find((l) => l.nsItemId === '301')!;
    expect(masque.quantity).toBe(2);
    expect(masque.amount).toBe(128);
    expect(masque.quantity * masque.unitPrice).toBeCloseTo(128, 10);
    expect(preview.grossSales).toBe(168);
    expect(preview.orderCount).toBe(2);
    expect(preview.tranDate).toBe('2026-06-30');
    expect(preview.periodLabel).toBe('June 2026');
  });

  it('flags unmapped SKUs and blocks reconciliation until resolved', () => {
    expect(preview.needsAttention).toHaveLength(1);
    expect(preview.needsAttention[0]).toMatchObject({
      reason: 'unmapped-product',
      row: { product: 'MYSTERY-SKU', productCharges: 30 },
    });
    expect(preview.reconciles).toBe(false);
  });

  it('carries promotions, refunds, fees (net of give-backs), reimbursements', () => {
    expect(preview.discountTotal).toBe(-5);
    expect(preview.refundTotal).toBe(-64);
    expect(preview.refundCount).toBe(1);
    // Commission 19.20 − 7.68 + FBA 5.05 + Subscription 39.99 = 56.56
    expect(preview.feeTotal).toBe(56.56);
    expect(preview.reimbursementTotal).toBe(23.68);
    expect(preview.computedNet).toBe(preview.reportNet);
  });

  it('produces a payload the existing push validation accepts once mapped', () => {
    const fullMap = new Map(SKU_MAP);
    fullMap.set('MYSTERY-SKU', { nsItemId: '303', nsItemName: 'Mystery' });
    const ready = buildMonthPreviewFromEvents('2026-06', EVENTS as any, fullMap);
    expect(ready.reconciles).toBe(true);
    expect(validatePushInput(ready)).toEqual([]);
  });

  it('surfaces non-itemized event lists as acknowledgeable unknown-type rows', () => {
    const withChargeback = { ...EVENTS, ChargebackEventList: [{ AmazonOrderId: 'x' }] };
    const p = buildMonthPreviewFromEvents('2026-06', withChargeback as any, SKU_MAP);
    const unknown = p.needsAttention.filter((a) => a.reason === 'unknown-type');
    expect(unknown).toHaveLength(1);
    expect(unknown[0].row.product).toContain('ChargebackEventList');
  });
});
