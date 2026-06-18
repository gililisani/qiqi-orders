-- Per-order Stripe payment tracking.
--
-- Set when an admin/client clicks "Send for Payment" (a Stripe invoice is
-- created) and updated by the Stripe webhook when it's paid. payment_status is
-- a SEPARATE axis from the order status: an In Process/Ready order can be unpaid
-- or paid. A paid order is locked (only "mark Done" remains).
--
--   payment_status: NULL = no request | 'pending' = awaiting payment | 'paid'
--
-- Clients read these (Pay Now link + Paid badge) via the existing own-company
-- SELECT policy on orders — no new policy needed.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text,
  ADD COLUMN IF NOT EXISTS stripe_invoice_number text,
  ADD COLUMN IF NOT EXISTS stripe_hosted_url text,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

COMMENT ON COLUMN public.orders.stripe_invoice_id IS 'Stripe Invoice id for this order''s card payment request.';
COMMENT ON COLUMN public.orders.stripe_hosted_url IS 'Stripe hosted invoice page URL — the client''s "Pay Now" link.';
COMMENT ON COLUMN public.orders.payment_status IS 'Card payment state: NULL (none) | pending | paid. Separate from order status.';
COMMENT ON COLUMN public.orders.paid_at IS 'When the Stripe payment was confirmed (webhook).';
