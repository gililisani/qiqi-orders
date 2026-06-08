-- The chain-aware worklist emits MULTIPLE rows per (item, location) — one per
-- negative window (e.g. FPS0021 has two separate windows at Square1-Missouri).
-- The original UNIQUE (item_code, location_ns_id) constraint (from the
-- one-row-per-location model) now causes "duplicate key" on insert.
--
-- The cache does delete-all-then-insert, so it doesn't rely on this constraint
-- for upserts. Drop it. Per-row identity is now (item_code, location_ns_id,
-- since) — status carry-over and "mark Done" key on that triple in code.

ALTER TABLE public.inv_inv_worklist
  DROP CONSTRAINT IF EXISTS inv_inv_worklist_item_code_location_ns_id_key;

-- Helpful index for the status-update lookups (not unique).
CREATE INDEX IF NOT EXISTS inv_inv_worklist_item_loc_since_idx
  ON public.inv_inv_worklist (item_code, location_ns_id, since);
