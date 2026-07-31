-- Amazon FBA — CSV verification audit trail.
-- When an admin uploads the month's Amazon CSV over an already-pushed batch,
-- the Hub compares CSV-derived totals against the pushed records and stores
-- the outcome here: who verified, when, per-record numbers, green or not.
ALTER TABLE public.amazon_fba_batches
  ADD COLUMN IF NOT EXISTS audit JSONB;

COMMENT ON COLUMN public.amazon_fba_batches.audit IS
  'Latest CSV verification: { verified_at, verified_by, verified_by_name, all_green, rows: [{label, csv, ns, match}] }. See docs/AMAZON_CSV_VERIFICATION.md.';
