-- Cache invoice amount remaining + due date on the order row.
--
-- The NetSuite invoice record exposes `amountRemaining` and `dueDate`
-- directly (we don't have to walk payments to compute them — useful
-- because this account's NextTransactionLink doesn't expose
-- payment-to-invoice links cleanly).
--
-- These are written by /api/netsuite/create-invoice (on initial invoice
-- creation) and refreshed by /api/netsuite/sync-invoice (the admin's
-- manual refresh button). Hub reads them when rendering client-facing
-- invoice status without re-hitting NetSuite per page view.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_amount_remaining NUMERIC,
  ADD COLUMN IF NOT EXISTS invoice_due_date DATE;

COMMENT ON COLUMN public.orders.invoice_amount_remaining IS
  'Cached from NetSuite invoice.amountRemaining at create-invoice / sync-invoice time. '
  'NULL = unknown (no invoice yet, or sync never ran). 0 = paid in full.';

COMMENT ON COLUMN public.orders.invoice_due_date IS
  'Cached from NetSuite invoice.dueDate. NULL = unknown. ISO date.';
