-- Inventory Investigation — DATED trusted snapshots (multi-date).
--
-- Unlike inv_inv_opening_snapshots (a single cutoff, CSV-imported), this holds
-- MANY point-in-time on-hand snapshots captured straight from the trusted
-- NetSuite "Allow Web Query" report feed — one set of (item, location, qoh)
-- rows per as-of date. The balance engine anchors each location at its nearest
-- prior snapshot and replays transactions forward, re-anchoring (and validating)
-- at every later snapshot. This bounds reconstruction drift to the gap between
-- two snapshots and makes the gap MEASURABLE (verified vs approximate).
--
-- Capture flow: the owner sets the report's "As of" date in NetSuite, then the
-- app fetches the feed and stores it tagged with that date.

CREATE TABLE IF NOT EXISTS public.inv_inv_dated_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of_date    DATE NOT NULL,
  item_code     TEXT NOT NULL,
  location_name TEXT NOT NULL,
  qoh           NUMERIC NOT NULL,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (as_of_date, item_code, location_name)
);

CREATE INDEX IF NOT EXISTS inv_inv_dated_snapshots_item_idx
  ON public.inv_inv_dated_snapshots (item_code, location_name, as_of_date);

ALTER TABLE public.inv_inv_dated_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_inv_dated_snapshots_admin_all
  ON public.inv_inv_dated_snapshots FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

-- Trust flag: FALSE when a row's negative window overlaps a snapshot-to-snapshot
-- segment whose forward replay did NOT reconcile to the trusted snapshot (i.e.
-- NetSuite has movements we can't see in that span — the number is approximate).
-- NULL = not evaluated (no dated snapshots covering it / legacy recompute).
ALTER TABLE public.inv_inv_worklist
  ADD COLUMN IF NOT EXISTS verified boolean;
ALTER TABLE public.inv_inv_negative_windows
  ADD COLUMN IF NOT EXISTS verified boolean;

-- Per-item detail cache carries the re-anchor corrections (so the client-side
-- ledger matches the worklist) + whether snapshots anchored the item.
ALTER TABLE public.inv_inv_items
  ADD COLUMN IF NOT EXISTS corrections jsonb;
ALTER TABLE public.inv_inv_items
  ADD COLUMN IF NOT EXISTS snapshots_applied boolean;
