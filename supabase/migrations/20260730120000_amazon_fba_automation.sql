-- =============================================================================
-- Amazon FBA automation — API-fed monthly batches.
--
-- The monthly close no longer needs a CSV: a Vercel cron (2nd of each month)
-- pulls the previous month from the SP-API Finances endpoint, builds the same
-- four-record preview, and stores it as a PREPARED batch. Admin gets an email
-- at the configured address and pushes from the page (or, once auto_push is
-- enabled, perfect months push themselves and the email carries the result).
-- =============================================================================

-- 1. Batches: allow the 'prepared' state + record where a batch came from.
ALTER TABLE public.amazon_fba_batches
  DROP CONSTRAINT IF EXISTS amazon_fba_batches_status_check;
ALTER TABLE public.amazon_fba_batches
  ADD CONSTRAINT amazon_fba_batches_status_check
  CHECK (status IN ('prepared', 'pushing', 'pushed', 'failed'));

ALTER TABLE public.amazon_fba_batches
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'csv'
  CHECK (source IN ('csv', 'api'));

-- 2. Config: automation switches.
ALTER TABLE public.amazon_fba_config
  ADD COLUMN IF NOT EXISTS auto_push BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.amazon_fba_config
  ADD COLUMN IF NOT EXISTS notify_email TEXT NOT NULL DEFAULT 'billing@qiqiglobal.com';

COMMENT ON COLUMN public.amazon_fba_config.auto_push IS
  'When TRUE the monthly cron pushes a prepared month to NetSuite automatically — but only when it reconciles, all SKUs are mapped, and config is complete. Otherwise it always waits for admin approval.';
COMMENT ON COLUMN public.amazon_fba_config.notify_email IS
  'Where the monthly cron sends its prepared/pushed/failed notifications.';
