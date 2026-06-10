-- Inventory Investigation — TRUSTED POINTS (replaces snapshot-as-foundation).
--
-- Lesson learned 2026-06: full-matrix dated snapshots go stale the moment the
-- owner fixes history in NetSuite (every snapshot after the earliest edited
-- date is invalidated → endless re-capture sessions). New model:
--   * BASE anchor = today's on-hand from the web-query feed (fetched fresh on
--     every recompute → self-heals after every fix, nothing stored).
--   * TRUSTED POINTS = sparse per-(item, location, date) balances read from
--     NetSuite's native "Review Negative Inventory" page (via the owner's
--     logged-in browser) or typed manually. Used as engine corrections to
--     bracket phantom residuals and verify historical windows.
-- A point is small, cheap to re-read live, and easy to delete when stale.

CREATE TABLE IF NOT EXISTS public.inv_inv_trusted_points (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code     TEXT NOT NULL,
  location_name TEXT NOT NULL,
  as_of_date    DATE NOT NULL,
  qty           NUMERIC NOT NULL,
  source        TEXT NOT NULL DEFAULT 'negatives_page', -- 'negatives_page' | 'manual'
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_code, location_name, as_of_date)
);

CREATE INDEX IF NOT EXISTS inv_inv_trusted_points_item_idx
  ON public.inv_inv_trusted_points (item_code, as_of_date);

ALTER TABLE public.inv_inv_trusted_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_inv_trusted_points_admin_all
  ON public.inv_inv_trusted_points FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
