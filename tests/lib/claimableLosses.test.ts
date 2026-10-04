import { describe, it, expect } from 'vitest';
import { computeClaimableLosses } from '@/lib/amazonFba/claimableLosses';

const NOW = new Date('2026-10-03T12:00:00Z');

const ledger = (over: Record<string, string>) => ({
  Date: '2026-09-20',
  FNSKU: 'X001',
  ASIN: 'B0TEST',
  MSKU: 'FPS0025-FBA',
  Title: 'Hair Controller',
  'Event Type': 'Adjustments',
  'Reference ID': 'ref',
  Quantity: '-3',
  'Fulfillment Center': 'PHX7',
  Disposition: 'SELLABLE',
  Reason: 'M',
  Country: 'US',
  ...over,
});

const reimb = (over: Record<string, string>) => ({
  'approval-date': '2026-09-25',
  reason: 'Lost_warehouse',
  sku: 'FPS0025-FBA',
  'product-name': 'Hair Controller',
  'quantity-reimbursed-total': '1',
  ...over,
});

describe('computeClaimableLosses', () => {
  it('nets lost − found − reimbursed per SKU, normalizing the -FBA suffix', () => {
    const snap = computeClaimableLosses(
      [
        ledger({ Quantity: '-5', Reason: 'M' }), // lost 5
        ledger({ Date: '2026-09-22', Quantity: '2', Reason: 'F' }), // found 2
      ],
      [reimb({ 'quantity-reimbursed-total': '1' })], // reimbursed 1
      NOW
    );
    expect(snap.rows).toHaveLength(1);
    expect(snap.rows[0]).toMatchObject({ sku: 'FPS0025', lost: 5, found: 2, reimbursed: 1, outstanding: 2 });
    expect(snap.rows[0].daysLeft).toBe(60 - 13); // event 2026-09-20 → 13 days old
  });

  it('drops losses older than the 60-day window', () => {
    const snap = computeClaimableLosses([ledger({ Date: '2026-07-20', Quantity: '-4' })], [], NOW);
    expect(snap.rows).toHaveLength(0);
  });

  it('classifies damaged reasons and prose reason text tolerantly', () => {
    const snap = computeClaimableLosses(
      [
        ledger({ Quantity: '-2', Reason: 'D' }),
        ledger({ Date: '2026-09-21', Quantity: '-1', Reason: 'Warehouse Damaged' }),
        ledger({ Date: '2026-09-22', Quantity: '-1', Reason: 'Misplaced in warehouse' }),
      ],
      [],
      NOW
    );
    expect(snap.rows[0]).toMatchObject({ damaged: 3, lost: 1, outstanding: 4 });
  });

  it('never counts unknown adjustment reasons — surfaces them instead', () => {
    const snap = computeClaimableLosses(
      [ledger({ Quantity: '-7', Reason: 'Q' }), ledger({ 'Event Type': 'Receipts', Quantity: '10' })],
      [],
      NOW
    );
    expect(snap.rows).toHaveLength(0);
    expect(snap.unknownReasons).toEqual([expect.objectContaining({ reason: 'Q', qty: -7, count: 1 })]);
  });

  it('customer-return reimbursements never offset warehouse losses', () => {
    const snap = computeClaimableLosses(
      [ledger({ Quantity: '-3' })],
      [reimb({ reason: 'CustomerReturn', 'quantity-reimbursed-total': '3' })],
      NOW
    );
    expect(snap.rows[0].outstanding).toBe(3);
    expect(snap.totals.outstandingUnits).toBe(3);
  });

  it('flags windows expiring within 10 days', () => {
    const snap = computeClaimableLosses([ledger({ Date: '2026-08-10', Quantity: '-2' })], [], NOW);
    expect(snap.rows[0].daysLeft).toBeLessThanOrEqual(10);
    expect(snap.totals.expiringSoon).toBe(1);
  });
});
