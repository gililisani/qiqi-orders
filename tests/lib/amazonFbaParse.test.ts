import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  parseReportRows,
  buildMonthPreviews,
  normalizeAmazonName,
  type AmazonItemMapping,
} from '@/lib/amazonFba/parseReport';

const HEADER =
  '"Date","Transaction Status","Transaction type","Order ID","Product Details","Total product charges","Total promotional rebates","Amazon fees","Other","Total (USD)"';

const MAPPINGS: AmazonItemMapping[] = [
  { amazon_name: 'QIQI All Out Blowout Blow Dry Cream | Ha...', ns_item_id: '101', ns_item_name: 'FPS0026 All Out Blowout', unit_price: 48 },
  { amazon_name: 'QIQI Smooth Service Shampoo - Moisturizi...', ns_item_id: '102', ns_item_name: 'FPS0027 Smooth Service Shampoo', unit_price: 40 },
];

function report(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseCsv', () => {
  it('handles quoted fields with commas and BOM', () => {
    const rows = parseCsv('﻿"a","b,c","d""e"\n"1","2","3"');
    expect(rows).toEqual([['a', 'b,c', 'd"e'], ['1', '2', '3']]);
  });
});

describe('parseReportRows', () => {
  it('rejects files without the expected columns', () => {
    const { rows, errors } = parseReportRows('"Foo","Bar"\n"1","2"');
    expect(rows).toEqual([]);
    expect(errors[0]).toContain('All Transactions');
  });

  it('parses both 4-digit and 2-digit years', () => {
    const { rows } = parseReportRows(report([
      '"1/15/2026","Released","Order Payment","111-1","QIQI All Out Blowout Blow Dry Cream | Ha...","48","0","-11","0","37"',
      '"1/16/26","Released","Order Payment","111-2","QIQI All Out Blowout Blow Dry Cream | Ha...","48","0","-11","0","37"',
    ]));
    expect(rows.map((r) => r.date)).toEqual(['2026-01-15', '2026-01-16']);
    expect(rows.every((r) => r.month === '2026-01')).toBe(true);
  });
});

describe('buildMonthPreviews', () => {
  it('reproduces the manual monthly cash-sale model and reconciles to the cent', () => {
    // Mirrors real January 2026: gross 376, seller discount -4.80,
    // refund -48 (+5.76 fee give-back), service fees, reserve noise.
    const { rows } = parseReportRows(report([
      // 7x All Out Blowout @48, one order with qty 2 (charge 96)
      '"1/03/2026","Released","Order Payment","111-A","QIQI All Out Blowout Blow Dry Cream | Ha...","96","0","-22","0","74"',
      '"1/05/2026","Released","Order Payment","111-B","QIQI All Out Blowout Blow Dry Cream | Ha...","48","0","-11","0","37"',
      '"1/07/2026","Released","Order Payment","111-C","QIQI All Out Blowout Blow Dry Cream | Ha...","48","0","-11","0","37"',
      '"1/09/2026","Released","Order Payment","111-D","QIQI All Out Blowout Blow Dry Cream | Ha...","48","0","-11","0","37"',
      '"1/11/2026","Released","Order Payment","111-E","QIQI All Out Blowout Blow Dry Cream | Ha...","48","0","-11","0","37"',
      '"1/13/2026","Released","Order Payment","111-F","QIQI All Out Blowout Blow Dry Cream | Ha...","48","0","-11","0","37"',
      // Amazon-funded promo: rebate offset by Other — NOT a seller discount
      '"1/15/2026","Released","Order Payment","111-G","QIQI Smooth Service Shampoo - Moisturizi...","40","-6.99","-10.76","6.99","29.24"',
      // Seller-funded promo: -4.80 with no offset
      '"1/21/2026","Released","Order Payment","111-H","QIQI Smooth Service Shampoo - Moisturizi...","40","-4.8","-10.76","0","24.44"',
      // Refund of one Blowout with fee give-back
      '"1/25/2026","Released","Refund","111-B","QIQI All Out Blowout Blow Dry Cream | Ha...","-48","0","5.76","0","-42.24"',
      // Service fees
      '"1/12/2026","Released","Service Fees","---","Subscription Fee:","0","0","-39.99","0","-39.99"',
      '"1/07/2026","Released","Service Fees","---","FBA Inventory Storage Fee","0","0","0","-0.68","-0.68"',
      // Reimbursement
      '"1/28/2026","Released","Inventory Reimbursement","---","FBA Inventory Reimbursement","0","0","0","23.68","23.68"',
      // Reserve noise
      '"1/31/2026","Released","Unavailable balance","---","Current Reserve Amount","0","0","0","-50","-50"',
      '"1/31/2026","Released","Previous statement\'s unavailable balance","---","Previous Reserve Amount Balance","0","0","0","50","50"',
    ]));
    const [jan] = buildMonthPreviews(rows, MAPPINGS);

    expect(jan.period).toBe('2026-01');
    expect(jan.periodLabel).toBe('January 2026');
    expect(jan.tranDate).toBe('2026-01-31');

    // Sales: 7 Blowout (one line qty 2) + 2 Shampoo = 376 + 40? -> 96+48*5+40+40 = 416
    expect(jan.grossSales).toBe(416);
    expect(jan.saleLines.find((l) => l.orderId === '111-A')?.quantity).toBe(2);
    expect(jan.orderCount).toBe(8);
    expect(jan.discountTotal).toBe(-4.8);

    expect(jan.refundTotal).toBe(-48);
    expect(jan.refundCount).toBe(1);

    // Fees: order fees 22+11*5+10.76+10.76=98.52, subscription 39.99,
    // storage 0.68, minus give-back 5.76 → 133.43
    expect(jan.feeTotal).toBe(133.43);
    expect(jan.feeLines.find((l) => l.label.includes('Referral'))?.amount).toBe(98.52);
    expect(jan.feeLines.find((l) => l.label.includes('Fee refunds'))?.amount).toBe(-5.76);
    expect(jan.feeLines.every((l) => l.bucket === 'platform')).toBe(true);

    expect(jan.reimbursementTotal).toBe(23.68);
    expect(jan.skippedBalanceRows).toBe(2);

    // 416 - 4.80 - 48 - 133.43 + 23.68 = 253.45
    expect(jan.computedNet).toBe(253.45);
    expect(jan.reportNet).toBe(253.45);
    expect(jan.reconciles).toBe(true);
    expect(jan.needsAttention).toEqual([]);
  });

  it('flags multi-product, unmapped, and non-integer-quantity rows and blocks reconciliation', () => {
    const { rows } = parseReportRows(report([
      '"2/01/2026","Released","Order Payment","112-A","QIQI Super Soaker Smoothing Masque 350G,...","104","0","-20","0","84"',
      '"2/02/2026","Released","Order Payment","112-B","QIQI Brand New Product Never Seen Before","30","0","-8","0","22"',
      '"2/03/2026","Released","Order Payment","112-C","QIQI All Out Blowout Blow Dry Cream | Ha...","50","0","-11","0","39"',
      '"2/04/2026","Released","Order Payment","112-D","QIQI All Out Blowout Blow Dry Cream | Ha...","48","0","-11","0","37"',
    ]));
    const [feb] = buildMonthPreviews(rows, MAPPINGS);
    const reasons = feb.needsAttention.map((a) => a.reason).sort();
    expect(reasons).toEqual(['ambiguous-quantity', 'multi-product', 'unmapped-product']);
    expect(feb.saleLines).toHaveLength(1); // only the clean 112-D row
    expect(feb.reconciles).toBe(false);
    // Attention rows still keep the reconciliation math honest
    expect(feb.computedNet).toBe(feb.reportNet);
  });

  it('treats zero-charge giveaway rows as non-sales but keeps their fees', () => {
    const { rows } = parseReportRows(report([
      '"3/01/2026","Released","Order Payment","113-A","QIQI Smooth Service Shampoo - Moisturizi...","0","0","-2","0","-2"',
    ]));
    const [mar] = buildMonthPreviews(rows, MAPPINGS);
    expect(mar.saleLines).toHaveLength(0);
    expect(mar.feeTotal).toBe(2);
    expect(mar.reconciles).toBe(true);
  });

  it('surfaces unknown transaction types instead of dropping them', () => {
    const { rows } = parseReportRows(report([
      '"4/01/2026","Released","Mystery Adjustment","---","Weird thing","0","0","0","-12","-12"',
    ]));
    const [apr] = buildMonthPreviews(rows, MAPPINGS);
    expect(apr.needsAttention[0]?.reason).toBe('unknown-type');
    expect(apr.reconciles).toBe(false);
  });

  it('splits a multi-month report into separate previews', () => {
    const { rows } = parseReportRows(report([
      '"1/15/2026","Released","Order Payment","111-A","QIQI All Out Blowout Blow Dry Cream | Ha...","48","0","-11","0","37"',
      '"2/15/2026","Released","Order Payment","112-A","QIQI All Out Blowout Blow Dry Cream | Ha...","48","0","-11","0","37"',
    ]));
    const previews = buildMonthPreviews(rows, MAPPINGS);
    expect(previews.map((p) => p.period)).toEqual(['2026-01', '2026-02']);
  });

  it('matches truncated names by prefix in both directions', () => {
    expect(normalizeAmazonName('  QIQI  Thing ...')).toBe('qiqi thing ...');
    const { rows } = parseReportRows(report([
      // Longer (less truncated) variant of a mapped name still matches
      '"5/01/2026","Released","Order Payment","115-A","QIQI All Out Blowout Blow Dry Cream | Hair Styling","48","0","-11","0","37"',
    ]));
    const [may] = buildMonthPreviews(rows, MAPPINGS);
    expect(may.saleLines).toHaveLength(1);
    expect(may.saleLines[0].nsItemId).toBe('101');
  });
});
