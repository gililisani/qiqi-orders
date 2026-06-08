-- Inventory Investigation — opening-balance snapshots.
--
-- True per-(item, location) on-hand as of a cutoff date, imported from a
-- NetSuite saved-search CSV. SuiteQL can't return point-in-time on-hand, and
-- "current QOH − later transactions" can't distinguish a real pre-window
-- opening (FPS0017: +1,134) from a late phantom adjustment (FPS0028: +24) —
-- they need opposite anchoring. A measured snapshot resolves it: the balance
-- engine starts each location at its snapshot qty on the cutoff and runs the
-- post-cutoff transactions forward, making all in-scope (2024+) balances exact.
--
-- Keyed on (item_code = SKU, location_name) since that's what a saved search
-- exports. Single active snapshot at a time (one cutoff); re-upload replaces.

CREATE TABLE IF NOT EXISTS public.inv_inv_opening_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cutoff_date   DATE NOT NULL,
  item_code     TEXT NOT NULL,
  location_name TEXT NOT NULL,
  qty           NUMERIC NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_code, location_name)
);

CREATE INDEX IF NOT EXISTS inv_inv_opening_snapshots_lookup_idx
  ON public.inv_inv_opening_snapshots (item_code, location_name);

ALTER TABLE public.inv_inv_opening_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_inv_opening_snapshots_admin_all
  ON public.inv_inv_opening_snapshots FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
