-- =============================================================================
-- Amazon FBA → NetSuite import tool.
--
-- Monthly flow: admin uploads the Seller Central "All Transactions" CSV; the
-- Hub parses it and creates, per calendar month:
--   Cash Sale  (gross sales, customer C2847 Amazon, lots auto-assigned @ FBA)
--   Cash Refund (product portion of refunds, no inventory impact)
--   Vendor Bill + Bill Payment (Amazon's fees, paid from the Amazon account)
--   Journal    (inventory reimbursements: debit Amazon acct / credit write-off)
--
-- Three tables:
--   1. amazon_item_map   — truncated Amazon product name → NS item + unit price
--                          (the report has no SKU/qty; qty = charge ÷ unit price)
--   2. amazon_fba_config — singleton with the NS internal IDs the records need.
--                          Seeded with everything resolvable by the integration
--                          role today; vendor/account IDs get filled from the
--                          settings panel once role permissions allow lookup.
--   3. amazon_fba_batches — one row per pushed month. UNIQUE(period) +
--                          NS external IDs make pushes idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. amazon_item_map
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amazon_item_map (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amazon_name   TEXT NOT NULL UNIQUE,      -- as it appears in the report (may be truncated)
  ns_item_id    TEXT NOT NULL,             -- NetSuite item internal id
  ns_item_name  TEXT NOT NULL,             -- human label for the UI
  unit_price    NUMERIC(10,2) NOT NULL CHECK (unit_price > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.amazon_item_map IS
  'Maps Amazon report product names (often truncated) to NetSuite items. unit_price infers quantity: qty = product charge / unit_price.';

ALTER TABLE public.amazon_item_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY amazon_item_map_admin_all
  ON public.amazon_item_map FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- 2. amazon_fba_config (singleton row, id always 1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amazon_fba_config (
  id                          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  customer_ns_id              TEXT NOT NULL DEFAULT '',  -- C2847 Amazon
  vendor_ns_id                TEXT NOT NULL DEFAULT '',  -- V5322 AMAZON
  subsidiary_ns_id            TEXT NOT NULL DEFAULT '',  -- Qiqi INC
  location_ns_id              TEXT NOT NULL DEFAULT '',  -- Amazon FBA
  currency_ns_id              TEXT NOT NULL DEFAULT '',  -- USD
  class_name                  TEXT NOT NULL DEFAULT '',  -- referenced by refName
  bank_account_ns_id          TEXT NOT NULL DEFAULT '',  -- 100505 Amazon QIQI INC (USD)
  platform_fees_account_ns_id TEXT NOT NULL DEFAULT '',  -- 622040 Amazon Platform Fees
  advertising_account_ns_id   TEXT NOT NULL DEFAULT '',  -- 630040 Amazon Advertisement
  writeoff_account_ns_id      TEXT NOT NULL DEFAULT '',  -- 620070 (reimbursement credit)
  refund_item_ns_id           TEXT NOT NULL DEFAULT '',  -- "Refund Adjustment"
  discount_item_ns_id         TEXT NOT NULL DEFAULT '',  -- discount item for promo line
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.amazon_fba_config IS
  'NetSuite internal IDs used by the Amazon FBA import. Empty string = not yet resolved; the settings panel fills gaps once role permissions allow.';

ALTER TABLE public.amazon_fba_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY amazon_fba_config_admin_all
  ON public.amazon_fba_config FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

-- Seed with IDs resolved via read-only SuiteQL on 2026-07-29. Vendor and
-- account IDs stay blank until the integration role can look them up
-- (Lists → Vendors: View, Lists → Accounts: View) or admin enters manually.
INSERT INTO public.amazon_fba_config (
  id, customer_ns_id, subsidiary_ns_id, location_ns_id, currency_ns_id,
  class_name, refund_item_ns_id
) VALUES (
  1, '72820', '3', '41', '1',
  'B2C Sales (Consumers)', '1440'
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. amazon_fba_batches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amazon_fba_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period       TEXT NOT NULL UNIQUE,          -- 'YYYY-MM'
  status       TEXT NOT NULL DEFAULT 'pushing'
               CHECK (status IN ('pushing', 'pushed', 'failed')),
  payload      JSONB NOT NULL DEFAULT '{}',   -- what was pushed (audit trail)
  ns_refs      JSONB NOT NULL DEFAULT '{}',   -- created NS record ids/tranids
  error        TEXT,
  created_by   UUID REFERENCES public.admins(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.amazon_fba_batches IS
  'One row per Amazon month pushed to NetSuite. UNIQUE(period) is the first idempotency layer; NS external IDs (AMAZON-FBA-*) are the second.';

ALTER TABLE public.amazon_fba_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY amazon_fba_batches_admin_all
  ON public.amazon_fba_batches FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
