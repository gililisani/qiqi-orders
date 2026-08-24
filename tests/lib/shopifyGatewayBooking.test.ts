import { describe, expect, it } from 'vitest';
import { buildPaypalPlan, buildAffirmPlan, type ExistingJournal } from '@/lib/shopify/core/gatewayBooking';
import type { PaypalTxn } from '@/lib/shopify/gateways/paypal';
import type { AffirmEvent } from '@/lib/shopify/gateways/affirm';

const pp = (o: Partial<PaypalTxn>): PaypalTxn => ({ transactionId: 'X1', eventCode: 'T0006', date: '2026-08-05T10:00:00Z', status: 'S', amount: '100.00', fee: '-5.00', invoiceId: null, ...o });
const af = (o: Partial<AffirmEvent>): AffirmEvent => ({ id: 'e1', date: '2026-08-10', eventType: 'loan_capture', salesCents: 5890, refundsCents: 0, feesCents: -383, totalSettledCents: 5507, depositId: 'D1', transactionId: 't1', orderId: null, purchaseId: 'P1-AAAA', chargeCreatedDate: '2026-08-09', transactionFeesCents: -30, originalLoanAmountCents: 5890, mdr: 0.0599, channel: 'Affirm Direct', merchantAri: 'HV7933BTF9S8GEWN', currency: 'USD', ...o });

describe('Phase B gateway booking transforms', () => {
  it('PayPal: monthly fee journal sums per-txn fees; withdrawals become transfers; hers are adopted; unknown codes surface', () => {
    const txns = [
      pp({ transactionId: 'A', amount: '100.00', fee: '-5.00' }),
      pp({ transactionId: 'B', amount: '50.00', fee: '-2.50', date: '2026-08-20T10:00:00Z' }),
      pp({ transactionId: 'W1', eventCode: 'T0403', amount: '-4227.51', fee: '0', date: '2026-07-14T09:00:00Z' }),
      pp({ transactionId: 'W2', eventCode: 'T0403', amount: '-1000.00', fee: '0', date: '2026-08-21T09:00:00Z' }),
      pp({ transactionId: 'H', eventCode: 'T1110', amount: '-278.00', fee: '0' }),
      pp({ transactionId: 'Z', eventCode: 'T9999', amount: '1.00', fee: '0' }),
    ];
    const hers: ExistingJournal[] = [{ id: 'JE1', date: '2026-07-14', clearingCents: -422751 }];
    const r = buildPaypalPlan(txns, hers, { feeFromMonth: '2026-08', currentMonth: '2026-09' });
    expect(r.monthlyFees).toEqual([{ externalId: 'QQPP-FEE-2026-08', tranDate: '2026-08-31', memo: 'PayPal processing fees 2026-08', cents: 750, kind: 'fee' }]);
    expect(r.transfers.find((t) => t.externalId === 'QQPP-XFER-W1')!.adoptedJournalId).toBe('JE1'); // hers stays hers
    expect(r.transfers.find((t) => t.externalId === 'QQPP-XFER-W2')!.adoptedJournalId).toBeUndefined(); // engine books
    expect(r.transfers.find((t) => t.externalId === 'QQPP-XFER-W2')!.cents).toBe(100000);
    expect(r.disputes).toHaveLength(1);
    expect(r.issues.join()).toContain('T9999');
  });

  it('Affirm: deposits grouped by deposit_id (capture+refund net), fees per engine deposit only; her deposits adopted and their fees go to catch-up', () => {
    const events = [
      af({ id: 'e1', depositId: 'D1', date: '2026-07-14', totalSettledCents: 5507, feesCents: -383 }),
      af({ id: 'e2', depositId: 'D2', date: '2026-08-20', totalSettledCents: 37320, feesCents: -2410, salesCents: 39730 }),
      af({ id: 'e3', depositId: 'D3', date: '2026-07-29', totalSettledCents: 8130, feesCents: -550 }),
      af({ id: 'e4', depositId: 'D3', date: '2026-07-29', eventType: 'loan_refund', salesCents: 0, refundsCents: -20000, feesCents: 0, totalSettledCents: -20000 }),
      af({ id: 'e5', depositId: 'D4', eventType: 'weird_event' }),
    ];
    const hers: ExistingJournal[] = [{ id: 'JE7', date: '2026-07-15', clearingCents: -5507 }];
    const r = buildAffirmPlan(events, hers);
    const d1 = r.deposits.find((d) => d.externalId === 'QQAF-DEP-D1')!;
    expect(d1.adoptedJournalId).toBe('JE7');
    expect(r.skippedFeeCents).toBe(383); // her deposit's fee → catch-up, not booked
    const d2 = r.deposits.find((d) => d.externalId === 'QQAF-DEP-D2')!;
    expect(d2.adoptedJournalId).toBeUndefined();
    expect(r.fees.find((f) => f.externalId === 'QQAF-FEE-D2')!.cents).toBe(2410);
    const d3 = r.deposits.find((d) => d.externalId === 'QQAF-DEP-D3')!;
    expect(d3.cents).toBe(8130 - 20000); // capture + refund in one deposit net
    expect(r.issues.join()).toContain('weird_event');
  });
});
