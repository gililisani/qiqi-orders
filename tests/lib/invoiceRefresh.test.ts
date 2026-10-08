import { describe, expect, it } from 'vitest';
import { isSettled, paidAtOnSettle } from '@/lib/invoiceRefresh';

describe('isSettled', () => {
  it('is Paid In Full with nothing remaining (tolerant status match)', () => {
    expect(isSettled({ netsuite_invoice_status: 'Paid In Full', invoice_amount_remaining: 0 })).toBe(true);
    expect(isSettled({ netsuite_invoice_status: 'paid in full', invoice_amount_remaining: 0 })).toBe(true);
    expect(isSettled({ netsuite_invoice_status: 'Paid In Full', invoice_amount_remaining: 10 })).toBe(false);
    expect(isSettled({ netsuite_invoice_status: 'Open', invoice_amount_remaining: 0 })).toBe(false);
  });
});

describe('paidAtOnSettle', () => {
  const NOW = new Date('2026-10-08T03:00:00Z');
  const open = { netsuite_invoice_status: 'Open', invoice_amount_remaining: 500, paid_at: null };
  const paid = { netsuite_invoice_status: 'Paid In Full', invoice_amount_remaining: 0 };

  it('stamps the day the Hub sees an invoice go from open to paid', () => {
    expect(paidAtOnSettle(open, paid, NOW)).toEqual({ paid_at: '2026-10-08T03:00:00.000Z' });
  });

  it('never stamps an invoice that was already settled, already dated, or is still open', () => {
    expect(paidAtOnSettle({ ...paid, paid_at: null }, paid, NOW)).toEqual({});
    expect(paidAtOnSettle({ ...open, paid_at: '2026-09-01T00:00:00Z' }, paid, NOW)).toEqual({});
    expect(paidAtOnSettle(open, { netsuite_invoice_status: 'Open', invoice_amount_remaining: 100 }, NOW)).toEqual({});
  });
});
