import { describe, it, expect } from 'vitest';
import { decideAutomation, type AutomationOrderRow } from '@/lib/fulfillment/orderAutomation';

const base: AutomationOrderRow = {
  id: 'o1',
  status: 'In Process',
  company_id: 'c1',
  fulfillment_status: null,
  netsuite_so_id: 'ns-1',
  netsuite_invoice_id: null,
};

describe('decideAutomation', () => {
  it('does nothing while the warehouse is still working', () => {
    expect(decideAutomation({ ...base, fulfillment_status: 'pending' })).toEqual({
      invoice: false,
      markReady: false,
      sendReadyEmail: false,
      markDone: false,
    });
    expect(decideAutomation({ ...base, fulfillment_status: null })).toMatchObject({ invoice: false, markDone: false });
  });

  it('packed → invoice + ready email (the owner-confirmed trigger point)', () => {
    expect(decideAutomation({ ...base, fulfillment_status: 'ready_for_pickup' })).toEqual({
      invoice: true,
      markReady: false,
      sendReadyEmail: true,
      markDone: false,
    });
  });

  it('packed with an invoice already in place just claims Ready + emails', () => {
    expect(
      decideAutomation({ ...base, fulfillment_status: 'ready_for_pickup', netsuite_invoice_id: 'inv-1' }),
    ).toEqual({ invoice: false, markReady: true, sendReadyEmail: true, markDone: false });
  });

  it('close-out on a Ready order → Done, no re-invoice, no ready email', () => {
    expect(
      decideAutomation({ ...base, status: 'Ready', fulfillment_status: 'shipped', netsuite_invoice_id: 'inv-1' }),
    ).toEqual({ invoice: false, markReady: false, sendReadyEmail: false, markDone: true });
  });

  it('close-out with a MISSED packed signal still invoices on the way to Done, without the ready email', () => {
    expect(decideAutomation({ ...base, fulfillment_status: 'shipped' })).toEqual({
      invoice: true,
      markReady: false,
      sendReadyEmail: false,
      markDone: true,
    });
  });

  it('never touches Done/Cancelled/Draft/Open orders', () => {
    for (const status of ['Done', 'Cancelled', 'Draft', 'Open']) {
      expect(decideAutomation({ ...base, status, fulfillment_status: 'shipped' })).toMatchObject({
        invoice: false,
        markDone: false,
      });
    }
  });

  it('does nothing without a NetSuite SO (manual repair territory)', () => {
    expect(
      decideAutomation({ ...base, netsuite_so_id: null, fulfillment_status: 'ready_for_pickup' }),
    ).toMatchObject({ invoice: false, markReady: false, markDone: false });
  });

  it('a warehouse cancellation does not cancel the Hub order', () => {
    expect(decideAutomation({ ...base, fulfillment_status: 'cancelled' })).toEqual({
      invoice: false,
      markReady: false,
      sendReadyEmail: false,
      markDone: false,
    });
  });
});
