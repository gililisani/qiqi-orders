-- Status/badge redesign (owner spec 2026-09-06): a single hold flag on orders.
--
--   'awaiting_client' — set automatically by Request Changes; cleared when the
--                       client re-saves the order. Informational badge.
--   'payment_hold'    — set by the admin (prepaid clients / untrusted wires);
--                       BLOCKS the warehouse push server-side. Cleared
--                       automatically when the payment lands (Stripe webhook /
--                       nightly NetSuite invoice sync) or manually by an admin.
--
-- No RLS change needed: clients already SELECT their own company's orders
-- (the column rides along), and all order writes go through service-role
-- routes — clients have no direct UPDATE path to abuse.

alter table public.orders
  add column if not exists hold text
  constraint orders_hold_check check (hold is null or hold in ('awaiting_client', 'payment_hold'));

comment on column public.orders.hold is
  'Order hold flag: awaiting_client (client asked to adjust) or payment_hold (blocks warehouse push until paid). NULL = no hold.';
