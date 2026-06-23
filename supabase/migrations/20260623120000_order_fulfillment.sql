-- 3PL fulfillment tracking on orders (provider-agnostic).
--
-- The Hub pushes Open/processing orders to a WMS (today ShipHero via BrandFox)
-- and receives a webhook when the order is fulfilled / ready for pickup. These
-- columns hold the provider link + the normalized fulfillment state, written
-- server-side by the fulfillment routes (service role).
--
-- Provider-neutral on purpose: `fulfillment_provider` records which adapter
-- owns the row so a second WMS later needs no schema change. Values mirror
-- lib/fulfillment/types.ts FulfillmentStatus.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_provider      text,
  ADD COLUMN IF NOT EXISTS external_fulfillment_id   text,       -- provider order id (e.g. ShipHero global id)
  ADD COLUMN IF NOT EXISTS external_fulfillment_legacy_id text,  -- provider legacy/integer id, when present
  ADD COLUMN IF NOT EXISTS fulfillment_status        text,       -- pending | ready_for_pickup | shipped | cancelled | unknown
  ADD COLUMN IF NOT EXISTS fulfillment_synced_at     timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_number           text,       -- only the rare CC-shipped case; pickup orders stay null
  ADD COLUMN IF NOT EXISTS tracking_carrier          text;

COMMENT ON COLUMN public.orders.fulfillment_provider IS
  'Which fulfillment adapter owns this order (e.g. ''shiphero''). NULL = not pushed to a WMS.';
COMMENT ON COLUMN public.orders.external_fulfillment_id IS
  'Provider order id returned by the WMS (ShipHero global id). Used to match inbound webhooks.';
COMMENT ON COLUMN public.orders.fulfillment_status IS
  'Normalized fulfillment state: pending | ready_for_pickup | shipped | cancelled | unknown. For ExWorks pickup orders, ready_for_pickup is the meaningful signal.';

-- Webhook lookups match on the provider order id.
CREATE INDEX IF NOT EXISTS idx_orders_external_fulfillment_id
  ON public.orders (external_fulfillment_id)
  WHERE external_fulfillment_id IS NOT NULL;

-- No new RLS policies needed: orders already grants admin full CRUD and lets a
-- client SELECT its own company's orders, so clients can read fulfillment_status
-- (intended — they want to know "ready for pickup"). All writes are service-role.
