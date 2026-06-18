-- Stripe Phase 2 — record the card payment back into NetSuite.
--
-- When Stripe confirms payment, the webhook records a NetSuite Customer Payment
-- applied to the order's invoice, deposited to the Stripe clearing account, so
-- NetSuite AR shows the invoice Paid In Full. We cache the NS payment id to make
-- the webhook idempotent (never record twice).
--
-- The deposit account is config (not hardcoded): account 361 = "Stripe - QIQI
-- INC (USD)". Card payments are Qiqi-INC-only (that account is INC-specific), so
-- one account suffices for now; a second tenant/subsidiary would add its own.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ns_customer_payment_id text;

COMMENT ON COLUMN public.orders.ns_customer_payment_id IS
  'NetSuite Customer Payment internal id recorded when the Stripe payment settled.';

INSERT INTO public.netsuite_item_map (purpose, ns_id, ns_name, allowed_on, description)
VALUES (
  'stripe_deposit_account', '361',
  '100502 CASH & CASH EQUIVALENTS : E- Commerce Bank : Stripe - QIQI INC (USD)',
  'invoice_only',
  'Deposit account for Stripe card payments recorded in NetSuite (Qiqi INC). Not an item — reuses this map as the NS-internal-id-by-purpose table.'
)
ON CONFLICT (purpose) DO NOTHING;
