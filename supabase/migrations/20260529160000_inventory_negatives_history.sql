-- Inventory Investigation — Negatives History + tiering.
--
-- Adds a damage TIER to each worklist case, and a table cataloguing every
-- negative window (per item, per location) found during the catalog recompute.
-- Both are populated by the existing "Recompute worklist" job. Admin-only.

ALTER TABLE public.inv_inv_worklist ADD COLUMN IF NOT EXISTS tier INT;

CREATE TABLE IF NOT EXISTS public.inv_inv_negative_windows (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code             TEXT NOT NULL,
  ns_item_id            TEXT,
  item_name             TEXT,
  location_ns_id        TEXT NOT NULL,
  location_name         TEXT,
  start_date            DATE NOT NULL,
  end_date              DATE,                 -- NULL = still negative (ongoing)
  min_balance           NUMERIC NOT NULL,     -- deepest end-of-day during the window
  duration_days         INT NOT NULL,
  builds_during         INT NOT NULL DEFAULT 0,
  other_outbound_during INT NOT NULL DEFAULT 0,
  status                TEXT NOT NULL,        -- 'Ongoing' | 'Closed'
  crossed_closed_period BOOLEAN NOT NULL DEFAULT FALSE,
  tier                  INT NOT NULL,         -- 1 toxic | 2 compounding | 3 dormant | 4 historical
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inv_inv_neg_windows_tier_idx ON public.inv_inv_negative_windows (tier, status);
CREATE INDEX IF NOT EXISTS inv_inv_neg_windows_item_idx ON public.inv_inv_negative_windows (item_code, location_ns_id);

ALTER TABLE public.inv_inv_negative_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_inv_negative_windows_admin_all
  ON public.inv_inv_negative_windows FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
