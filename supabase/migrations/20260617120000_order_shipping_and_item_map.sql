-- Shipping charge on orders + a NetSuite item-map config table.
--
-- TWO things here:
--
-- 1. orders.shipping_amount — an admin-only dollar charge added to an order
--    AFTER creation. Hidden from the client until set; once set it shows on the
--    order (read-only for clients) and is included in the effective order total.
--    It is pushed to NetSuite as a line on the Sales Order AND the Invoice using
--    the "shipping" item from the map below.
--
-- 2. netsuite_item_map — the first brick of the productization/config layer.
--    NetSuite item internal IDs that used to be hardcoded now live as DATA so a
--    future "NetSuite mapping" admin page can edit them, and a second tenant can
--    point at their own items. `allowed_on` encodes a hard rule: the credit-card
--    processing fee may only ever land on an Invoice, never on a Sales Order.
--    (support-fund / tax items migrate here later.)

-- ---------------------------------------------------------------------------
-- 1. Shipping amount
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_amount numeric(12,2);

COMMENT ON COLUMN public.orders.shipping_amount IS
  'Admin-only shipping charge in the order currency. NULL/0 = none. Included in the effective order total and pushed to the NS SO + Invoice as the mapped shipping item.';

-- ---------------------------------------------------------------------------
-- 2. NetSuite item map (config)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.netsuite_item_map (
  purpose     TEXT PRIMARY KEY,                       -- 'shipping', 'cc_processing_fee', ...
  ns_id       TEXT NOT NULL,                          -- NetSuite item internal id
  ns_name     TEXT,                                   -- human label (NS itemid), for the UI
  allowed_on  TEXT NOT NULL DEFAULT 'so_and_invoice', -- 'so_and_invoice' | 'invoice_only'
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT netsuite_item_map_allowed_on_chk
    CHECK (allowed_on IN ('so_and_invoice', 'invoice_only'))
);

COMMENT ON TABLE public.netsuite_item_map IS
  'Config map of NetSuite item internal IDs by purpose. Read server-side only (service role). allowed_on enforces where each item may be placed.';

ALTER TABLE public.netsuite_item_map ENABLE ROW LEVEL SECURITY;

-- Admin-only. Server routes use the service role (bypasses RLS); this policy
-- just keeps the browser-direct surface admin-locked. Clients never read it.
CREATE POLICY netsuite_item_map_admin_all
  ON public.netsuite_item_map FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

-- Seed Qiqi's current items. Both are invoice-only: verified against the live
-- NetSuite REST API, SHI0006 is rejected as a Sales Order line ("Invalid Field
-- Value 1451 for item") even though the NS UI lets you add it — a known UI-vs-API
-- gap. So the Hub places shipping on the Invoice only. If the item is later
-- reconfigured to be SO-eligible, flip its allowed_on to 'so_and_invoice'.
INSERT INTO public.netsuite_item_map (purpose, ns_id, ns_name, allowed_on, description)
VALUES
  ('shipping',          '1451', 'SHI0006',                    'invoice_only', 'Shipping charge line. Invoice-only (NS API rejects it on a Sales Order).'),
  ('cc_processing_fee', '1069', 'Credit Card Processing Fee', 'invoice_only', 'Credit-card surcharge. Invoice only — never on a Sales Order.')
ON CONFLICT (purpose) DO NOTHING;
