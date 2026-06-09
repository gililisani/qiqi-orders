-- Worklist rows now carry a reconciliation status against the trusted NetSuite
-- "Allow Web Query" report feed (lib/inventory/feedReconcile.ts):
--   'confirmed' — ongoing negative the report agrees with (depth is the report's)
--   'surfaced'  — report says negative but the engine had no case (shown MANUAL)
--   'unmatched' — engine ongoing negative the report has no row for (verify mapping)
--   NULL        — not reconciled (closed/historical row, or feed unavailable)
--
-- Nullable, no default: existing rows read back as NULL until the next recompute.
ALTER TABLE public.inv_inv_worklist
  ADD COLUMN IF NOT EXISTS feed_status text;
