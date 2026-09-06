import { describe, expect, it } from 'vitest';
import { deriveOrderBadges, displayOrderStatus, isOrderPaid } from '@/lib/orderBadges';

const base = { status: 'In Process' };

describe('isOrderPaid', () => {
  it('is paid via Stripe payment_status', () => {
    expect(isOrderPaid({ ...base, payment_status: 'paid' })).toBe(true);
  });

  it('is paid via tolerant NetSuite status text', () => {
    expect(isOrderPaid({ ...base, netsuite_invoice_status: 'Paid In Full' })).toBe(true);
    expect(isOrderPaid({ ...base, netsuite_invoice_status: 'paid in full (deposited)' })).toBe(true);
  });

  it('is paid when the invoice balance hits zero', () => {
    expect(isOrderPaid({ ...base, netsuite_invoice_id: '123', invoice_amount_remaining: 0 })).toBe(true);
  });

  it('a zero balance without an invoice is NOT paid (nothing was billed)', () => {
    expect(isOrderPaid({ ...base, invoice_amount_remaining: 0 })).toBe(false);
  });

  it('an open balance is not paid', () => {
    expect(isOrderPaid({ ...base, netsuite_invoice_id: '123', invoice_amount_remaining: 150.5 })).toBe(false);
  });
});

describe('displayOrderStatus', () => {
  it('Done + paid reads as Closed', () => {
    expect(
      displayOrderStatus({ status: 'Done', netsuite_invoice_id: '1', invoice_amount_remaining: 0 }),
    ).toBe('Closed');
  });

  it('Done unpaid stays Done', () => {
    expect(
      displayOrderStatus({ status: 'Done', netsuite_invoice_id: '1', invoice_amount_remaining: 99 }),
    ).toBe('Done');
  });

  it('every other status passes through', () => {
    expect(displayOrderStatus({ status: 'Ready', payment_status: 'paid' })).toBe('Ready');
  });
});

describe('deriveOrderBadges', () => {
  it('draft and cancelled orders carry no chips', () => {
    expect(deriveOrderBadges({ status: 'Draft', netsuite_invoice_id: '1' })).toEqual([]);
    expect(deriveOrderBadges({ status: 'Cancelled', hold: 'payment_hold' })).toEqual([]);
  });

  it('money chip: exactly one of paid / requested / awaiting', () => {
    const paid = deriveOrderBadges({ ...base, netsuite_invoice_id: '1', invoice_amount_remaining: 0 });
    expect(paid.map((c) => c.key)).toContain('paid');
    expect(paid.map((c) => c.key)).not.toContain('awaiting_payment');

    const requested = deriveOrderBadges({
      ...base,
      netsuite_invoice_id: '1',
      invoice_amount_remaining: 100,
      payment_status: 'pending',
    });
    expect(requested.map((c) => c.key)).toEqual(['payment_requested']);

    const awaiting = deriveOrderBadges({ ...base, netsuite_invoice_id: '1', invoice_amount_remaining: 100 });
    expect(awaiting.map((c) => c.key)).toEqual(['awaiting_payment']);
  });

  it('in-packing shows only while In Process at a live warehouse order', () => {
    const inPacking = deriveOrderBadges({ ...base, external_fulfillment_id: 'sh1', fulfillment_status: 'pending' });
    expect(inPacking.map((c) => c.key)).toEqual(['in_packing']);

    expect(
      deriveOrderBadges({ status: 'Ready', external_fulfillment_id: 'sh1', fulfillment_status: 'ready_for_pickup' })
        .map((c) => c.key),
    ).not.toContain('in_packing');

    expect(
      deriveOrderBadges({ ...base, external_fulfillment_id: 'sh1', fulfillment_status: 'cancelled' }),
    ).toEqual([]);
  });

  it('hold chips: payment hold on an unpaid prepaid order', () => {
    const chips = deriveOrderBadges({ ...base, hold: 'payment_hold' });
    expect(chips.map((c) => c.key)).toEqual(['payment_hold']);
  });

  it('awaiting client on an Open order after request-changes', () => {
    const chips = deriveOrderBadges({ status: 'Open', hold: 'awaiting_client' });
    expect(chips.map((c) => c.key)).toEqual(['awaiting_client']);
  });
});
