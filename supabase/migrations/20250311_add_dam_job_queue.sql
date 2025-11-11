-- --------------------------------------------------
-- DAM job queue table for worker processing
-- --------------------------------------------------

CREATE TABLE IF NOT EXISTS dam_job_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dam_job_queue_status_run_at
  ON dam_job_queue (status, run_at);

CREATE INDEX IF NOT EXISTS idx_dam_job_queue_run_at
  ON dam_job_queue (run_at);

CREATE OR REPLACE FUNCTION dam_job_queue_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dam_job_queue_touch ON dam_job_queue;
CREATE TRIGGER dam_job_queue_touch
  BEFORE UPDATE ON dam_job_queue
  FOR EACH ROW
  EXECUTE FUNCTION dam_job_queue_touch_updated_at();

ALTER TABLE dam_job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY dam_job_queue_read ON dam_job_queue
  FOR SELECT
  USING (true);

CREATE POLICY dam_job_queue_modify ON dam_job_queue
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
