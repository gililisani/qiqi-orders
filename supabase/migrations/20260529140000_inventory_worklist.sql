-- Inventory Investigation — auto-recommendation WORKLIST.
--
-- The new home page of the tool: one row per (item, location) negative case,
-- each with a recommended fix computed server-side via the balance engine's
-- simulate(). Recomputed on demand ("Recompute worklist" button / script).
-- Admin-only, like the rest of the inv_inv_* tables.

CREATE TABLE IF NOT EXISTS public.inv_inv_worklist (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code                 TEXT NOT NULL,
  ns_item_id                TEXT,
  item_name                 TEXT,
  location_ns_id            TEXT NOT NULL,
  location_name             TEXT,
  depth                     NUMERIC NOT NULL,         -- deepest negative (negative number)
  since                     DATE,                     -- first date it went negative
  recommended_action        TEXT NOT NULL,            -- REDUCE_QTY|DELETE|CHANGE_DATE_FORWARD|MANUAL_REVIEW
  suspect_ns_transaction_id TEXT,
  suspect_doc               TEXT,
  suspect_type              TEXT,
  suspect_date              DATE,
  change_from               TEXT,
  change_to                 TEXT,
  confidence                TEXT NOT NULL,            -- CLEAN|PARTIAL|NONE
  notes                     TEXT,
  status                    TEXT NOT NULL DEFAULT 'todo', -- todo|done|skipped
  computed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_code, location_ns_id)
);

CREATE INDEX IF NOT EXISTS inv_inv_worklist_depth_idx ON public.inv_inv_worklist (depth);

-- Single-row run metadata (last recompute time + stats), so the UI can show
-- "last computed" even when the worklist is empty.
CREATE TABLE IF NOT EXISTS public.inv_inv_worklist_meta (
  id            INT PRIMARY KEY DEFAULT 1,
  computed_at   TIMESTAMPTZ,
  items_scanned INT,
  cases         INT,
  clean_count   INT,
  duration_ms   INT,
  CONSTRAINT inv_inv_worklist_meta_single CHECK (id = 1)
);

ALTER TABLE public.inv_inv_worklist      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_inv_worklist_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_inv_worklist_admin_all
  ON public.inv_inv_worklist FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

CREATE POLICY inv_inv_worklist_meta_admin_all
  ON public.inv_inv_worklist_meta FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
