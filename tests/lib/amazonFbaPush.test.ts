import { describe, it, expect } from 'vitest';
import {
  missingConfigFields,
  validatePushInput,
  planLotAssignments,
  type AmazonFbaConfig,
  type MonthPushInput,
} from '@/lib/amazonFba/pushToNetSuite';

const FULL_CONFIG: AmazonFbaConfig = {
  customer_ns_id: '72820',
  vendor_ns_id: '99999',
  subsidiary_ns_id: '3',
  location_ns_id: '41',
  currency_ns_id: '1',
  class_name: 'B2C Sales (Consumers)',
  bank_account_ns_id: '501',
  platform_fees_account_ns_id: '502',
  advertising_account_ns_id: '503',
  writeoff_account_ns_id: '504',
  refund_item_ns_id: '1440',
  discount_item_ns_id: '1146',
};

const INPUT: MonthPushInput = {
  period: '2026-01',
  periodLabel: 'January 2026',
  tranDate: '2026-01-31',
  saleLines: [
    { orderId: '111-A', amazonName: 'x', nsItemId: '101', nsItemName: 'Blowout', quantity: 2, unitPrice: 48, amount: 96 },
    { orderId: '111-B', amazonName: 'y', nsItemId: '102', nsItemName: 'Shampoo', quantity: 1, unitPrice: 40, amount: 40 },
  ],
  discountTotal: -4.8,
  refundTotal: -48,
  feeLines: [{ label: 'Referral & FBA fees on orders', bucket: 'platform', amount: 90.2 }],
  reimbursementTotal: 23.68,
};

describe('missingConfigFields', () => {
  it('passes with a complete config', () => {
    expect(missingConfigFields(FULL_CONFIG, INPUT)).toEqual([]);
  });

  it('only requires fields the month actually uses', () => {
    const noFees = { ...INPUT, feeLines: [], refundTotal: 0, discountTotal: 0, reimbursementTotal: 0 };
    const config = { ...FULL_CONFIG, vendor_ns_id: '', refund_item_ns_id: '', discount_item_ns_id: '', writeoff_account_ns_id: '' };
    expect(missingConfigFields(config, noFees)).toEqual([]);
    expect(missingConfigFields(config, INPUT)).toEqual([
      'Discount item',
      'Refund item',
      'Amazon vendor (V5322)',
      'Write-off account (620070)',
    ]);
  });

  it('requires the advertising account only when advertising fees exist', () => {
    const config = { ...FULL_CONFIG, advertising_account_ns_id: '' };
    expect(missingConfigFields(config, INPUT)).toEqual([]);
    const withAds = {
      ...INPUT,
      feeLines: [...INPUT.feeLines, { label: 'Cost of Advertising', bucket: 'advertising' as const, amount: 10 }],
    };
    expect(missingConfigFields(config, withAds)).toEqual(['Advertising account (630040)']);
  });
});

describe('validatePushInput', () => {
  it('accepts a consistent payload', () => {
    expect(validatePushInput(INPUT)).toEqual([]);
  });

  it('rejects qty × price ≠ amount, bad dates, and empty months', () => {
    const bad = {
      ...INPUT,
      tranDate: '2026-02-01',
      saleLines: [{ ...INPUT.saleLines[0], amount: 100 }],
    };
    const errors = validatePushInput(bad);
    expect(errors.some((e) => e.includes('inside the period'))).toBe(true);
    expect(errors.some((e) => e.includes('≠'))).toBe(true);

    const empty = { ...INPUT, saleLines: [], discountTotal: 0, refundTotal: 0, feeLines: [], reimbursementTotal: 0 };
    expect(validatePushInput(empty)).toEqual(['Nothing to push for this month.']);
  });
});

describe('planLotAssignments', () => {
  // Mock answers both queries: the lot-flag lookup, then the balances.
  const nsWithLots = (
    rows: { item: string; inventorynumber: string; quantityavailable: string }[],
    nonLotItems: string[] = []
  ) =>
    ({
      suiteQL: async (query: string) => {
        if (query.includes('islotitem')) {
          const ids = [...new Set([...rows.map((r) => r.item), ...nonLotItems, '101', '102'])];
          return ids.map((id) => ({ id, islotitem: nonLotItems.includes(id) ? 'F' : 'T' }));
        }
        return rows;
      },
    }) as any;

  it('assigns from a single lot when it has enough', async () => {
    const plan = await planLotAssignments(
      nsWithLots([
        { item: '101', inventorynumber: '900', quantityavailable: '10' },
        { item: '102', inventorynumber: '901', quantityavailable: '5' },
      ]),
      '41',
      INPUT.saleLines
    );
    expect(plan.get(0)).toEqual([{ lotId: '900', quantity: 2 }]);
    expect(plan.get(1)).toEqual([{ lotId: '901', quantity: 1 }]);
  });

  it('splits across lots when one is not enough, tracking depletion across lines', async () => {
    const lines = [
      { ...INPUT.saleLines[0], quantity: 3, amount: 144 },
      { ...INPUT.saleLines[0], orderId: '111-C', quantity: 2, amount: 96 },
    ];
    const plan = await planLotAssignments(
      nsWithLots([
        { item: '101', inventorynumber: '900', quantityavailable: '4' },
        { item: '101', inventorynumber: '901', quantityavailable: '2' },
      ]),
      '41',
      lines
    );
    expect(plan.get(0)).toEqual([{ lotId: '900', quantity: 3 }]);
    // second line takes the remaining 1 from lot 900, then 1 from 901
    expect(plan.get(1)).toEqual([
      { lotId: '900', quantity: 1 },
      { lotId: '901', quantity: 1 },
    ]);
  });

  it('throws a shortage error with MONTH totals, naming every short item', async () => {
    await expect(
      planLotAssignments(
        nsWithLots([{ item: '101', inventorynumber: '900', quantityavailable: '1' }]),
        '41',
        INPUT.saleLines
      )
    ).rejects.toThrow(
      /Blowout: this month sold 2, only 1 available.*\(short 1\).*\n.*Shampoo: this month sold 1, only 0 available.*\(short 1\)/s
    );
  });

  it('aggregates many qty-1 lines into one per-item total (the 2026-08 failure mode)', async () => {
    // 18 lines of qty 1 vs 17 available — the old message said "need 1, only 0".
    const lines = Array.from({ length: 18 }, (_, i) => ({
      ...INPUT.saleLines[1],
      orderId: `111-${i}`,
    }));
    await expect(
      planLotAssignments(
        nsWithLots([{ item: '102', inventorynumber: '901', quantityavailable: '17' }]),
        '41',
        lines
      )
    ).rejects.toThrow(/Shampoo: this month sold 18, only 17 available.*\(short 1\)/);
  });

  it('gives non-lot-tracked items an empty plan instead of lots or shortages', async () => {
    // item 102 is not lot-tracked (like KIT0034) — no lots, no shortage check
    const plan = await planLotAssignments(
      nsWithLots([{ item: '101', inventorynumber: '900', quantityavailable: '10' }], ['102']),
      '41',
      INPUT.saleLines
    );
    expect(plan.get(0)).toEqual([{ lotId: '900', quantity: 2 }]);
    expect(plan.get(1)).toEqual([]); // NS line gets no inventoryDetail
  });
});
