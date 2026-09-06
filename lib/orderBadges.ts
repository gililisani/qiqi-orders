/**
 * Order badges — derived, never stored (status/badge redesign 2026-09-06).
 *
 * The order's life has three independent dimensions:
 *   package  — the status spine (Draft → Open → In Process → Ready → Done)
 *   money    — invoice / payment state, cached from NetSuite + Stripe
 *   holds    — the single `orders.hold` flag (awaiting_client | payment_hold)
 *
 * This module turns the money + hold dimensions into at most three small
 * chips shown next to the status badge, and derives the display-only
 * "Closed" status (Done + fully paid). Nothing here writes anything.
 */

export interface OrderBadgeFields {
  status: string;
  hold?: string | null;
  netsuite_invoice_id?: string | null;
  netsuite_invoice_status?: string | null;
  invoice_amount_remaining?: number | null;
  payment_status?: string | null;
  external_fulfillment_id?: string | null;
  fulfillment_status?: string | null;
}

export type OrderBadgeTone = 'neutral' | 'positive' | 'attention' | 'negative';

export interface OrderBadgeChip {
  key: 'paid' | 'payment_requested' | 'awaiting_payment' | 'in_packing' | 'awaiting_client' | 'payment_hold';
  label: string;
  tone: OrderBadgeTone;
}

/** Paid = NetSuite says the invoice is settled, or Stripe confirmed payment.
 *  Tolerant matching, never strict-equal (status text varies by account). */
export function isOrderPaid(o: OrderBadgeFields): boolean {
  if (o.payment_status === 'paid') return true;
  if ((o.netsuite_invoice_status || '').toLowerCase().includes('paid in full')) return true;
  return o.netsuite_invoice_id != null && Number(o.invoice_amount_remaining) === 0;
}

/** Display status: Done + fully paid reads as "Closed". Derived only — the
 *  stored status stays 'Done' so reports and gating never change meaning. */
export function displayOrderStatus(o: OrderBadgeFields): string {
  if (o.status === 'Done' && isOrderPaid(o)) return 'Closed';
  return o.status;
}

/** At most one chip per dimension: money, package, hold. */
export function deriveOrderBadges(o: OrderBadgeFields): OrderBadgeChip[] {
  const chips: OrderBadgeChip[] = [];

  // Dead orders carry no chips — the status says everything.
  if (o.status === 'Cancelled' || o.status === 'Draft') return chips;

  // Money — one chip: Paid ▸ Payment requested ▸ Awaiting payment.
  const paid = isOrderPaid(o);
  if (paid) {
    chips.push({ key: 'paid', label: 'Paid', tone: 'positive' });
  } else if (o.payment_status === 'pending') {
    chips.push({ key: 'payment_requested', label: 'Payment requested', tone: 'attention' });
  } else if (o.netsuite_invoice_id) {
    chips.push({ key: 'awaiting_payment', label: 'Awaiting payment', tone: 'attention' });
  }

  // Package — only worth a chip while In Process (Ready/Done say it themselves).
  const atWarehouse =
    !!o.external_fulfillment_id &&
    o.fulfillment_status !== 'cancelled' &&
    o.fulfillment_status !== 'shipped';
  if (o.status === 'In Process' && atWarehouse) {
    chips.push({ key: 'in_packing', label: 'In packing', tone: 'neutral' });
  }

  // Holds.
  if (o.hold === 'awaiting_client') {
    chips.push({ key: 'awaiting_client', label: 'Awaiting client', tone: 'attention' });
  } else if (o.hold === 'payment_hold') {
    chips.push({ key: 'payment_hold', label: 'Payment hold', tone: 'negative' });
  }

  return chips;
}
