-- Company-level credit-card payment settings (Stripe).
--
-- Gates the per-order "Send for Payment" flow: only a company with
-- enable_credit_card_payments = true can be charged by card. credit_card_fee_percent
-- is the per-company surcharge added to the invoice + Stripe charge (3% normal;
-- 4.5% for the Puerto Rico card whose processing fee is higher). stripe_customer_id
-- caches the Stripe Customer so we don't re-create it per order.
--
-- Per-company (not global) because processing fees vary by the client's card.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS enable_credit_card_payments boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_card_fee_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

COMMENT ON COLUMN public.companies.enable_credit_card_payments IS
  'When true, this company can pay orders by credit card (Stripe). Drives the "Send for Payment" button.';
COMMENT ON COLUMN public.companies.credit_card_fee_percent IS
  'Per-company card surcharge percent (e.g. 3.00, 4.50). Applied to (items + shipping) on the invoice and the Stripe charge.';
COMMENT ON COLUMN public.companies.stripe_customer_id IS
  'Cached Stripe Customer id for this company.';
