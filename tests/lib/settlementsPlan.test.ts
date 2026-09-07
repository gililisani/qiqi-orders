import { describe, it, expect } from 'vitest';
import { planPaypal, planAffirm } from '@/lib/settlements/plan';
import type { PaypalTxn } from '@/lib/shopify/gateways/paypal';
import type { AffirmEvent } from '@/lib/shopify/gateways/affirm';

const tx = (over: Partial<PaypalTxn>): PaypalTxn => ({
  transactionId: 'X',
  eventCode: 'T0006',
  date: '2026-06-10T12:00:00Z',
  status: 'S',
  amount: '100',
  fee: '-3.2',
  invoiceId: null,
  ...over,
});

describe('planPaypal', () => {
  it('aggregates fees monthly and nets refund fee give-backs', () => {
    const plan = planPaypal([
      tx({ transactionId: 'a', amount: '100', fee: '-3.2' }),
      tx({ transactionId: 'b', amount: '50', fee: '-1.8' }),
      // refund in the same month gives part of the fee back (positive fee)
      tx({ transactionId: 'c', eventCode: 'T1107', amount: '-50', fee: '1.5' }),
      // sale in a different month lands in its own bill
      tx({ transactionId: 'd', date: '2026-07-02T08:00:00Z', amount: '200', fee: '-6.0' }),
    ]);
    expect(plan.feeBills).toHaveLength(2);
    expect(plan.feeBills[0]).toMatchObject({ periodKey: '2026-06', feeTotal: 3.5 }); // 3.2+1.8-1.5
    expect(plan.feeBills[1]).toMatchObject({ periodKey: '2026-07', feeTotal: 6.0 });
    expect(plan.salesCount).toBe(3);
    expect(plan.refundsCount).toBe(1);
  });

  it('turns each withdrawal into one journal dated on initiation', () => {
    const plan = planPaypal([
      tx({ transactionId: 'w1', eventCode: 'T0400', amount: '-743.52', fee: '0', date: '2026-09-08T09:00:00Z' }),
    ]);
    expect(plan.withdrawalJournals).toEqual([
      expect.objectContaining({ date: '2026-09-08', amount: 743.52, reference: 'w1' }),
    ]);
    expect(plan.feeBills).toHaveLength(0);
  });

  it('skips non-settled transactions and surfaces unknown event codes', () => {
    const plan = planPaypal([
      tx({ transactionId: 'p', status: 'P' }), // pending — ignored entirely
      tx({ transactionId: 'z', eventCode: 'T9999', amount: '12' }),
      tx({ transactionId: 'bank', eventCode: 'T0300', amount: '500', fee: '0' }), // money in — ignored
    ]);
    expect(plan.salesCount).toBe(0);
    expect(plan.unclassified).toEqual([expect.objectContaining({ eventCode: 'T9999', count: 1 })]);
  });

  it('books chargeback-style T01xx fees into the month bill', () => {
    const plan = planPaypal([tx({ transactionId: 'cb', eventCode: 'T0106', amount: '-20', fee: '0' })]);
    expect(plan.feeBills[0]).toMatchObject({ periodKey: '2026-06', feeTotal: 20 });
  });
});

const ev = (over: Partial<AffirmEvent>): AffirmEvent => ({
  id: 'e1',
  date: '2026-09-01',
  eventType: 'loan_capture',
  salesCents: 50000,
  refundsCents: 0,
  feesCents: -1500,
  totalSettledCents: 48500,
  depositId: 'dep-1',
  transactionId: null,
  orderId: null,
  purchaseId: null,
  chargeCreatedDate: null,
  transactionFeesCents: 0,
  originalLoanAmountCents: null,
  mdr: null,
  channel: null,
  merchantAri: null,
  currency: 'USD',
  ...over,
});

describe('planAffirm', () => {
  it('groups events by deposit: one fee bill + one net journal each', () => {
    const plan = planAffirm([
      ev({ id: 'a', depositId: 'dep-1', feesCents: -1000, totalSettledCents: 24000 }),
      ev({ id: 'b', depositId: 'dep-1', feesCents: -500, totalSettledCents: 24500 }),
      ev({ id: 'c', depositId: 'dep-2', date: '2026-09-03', feesCents: -300, totalSettledCents: 9700 }),
    ]);
    expect(plan.deposits).toHaveLength(2);
    expect(plan.feeBills).toEqual([
      expect.objectContaining({ periodKey: '2026-09-01', feeTotal: 15 }),
      expect.objectContaining({ periodKey: '2026-09-03', feeTotal: 3 }),
    ]);
    expect(plan.payoutJournals).toEqual([
      expect.objectContaining({ date: '2026-09-01', amount: 485, reference: 'dep-1' }),
      expect.objectContaining({ date: '2026-09-03', amount: 97, reference: 'dep-2' }),
    ]);
  });

  it('skips zero-value bills and journals', () => {
    const plan = planAffirm([ev({ feesCents: 0, totalSettledCents: 0 })]);
    expect(plan.feeBills).toHaveLength(0);
    expect(plan.payoutJournals).toHaveLength(0);
  });
});
