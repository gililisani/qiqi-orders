import 'dotenv/config';
import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from './supabase';
import { logger } from './logger';
import { processVersionJob } from './jobs/processVersion';

interface JobRow {
  id: string;
  job_name: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  run_at: string;
  locked_at: string | null;
  locked_by: string | null;
  error: string | null;
}

const workerId = process.env.WORKER_ID || `dam-worker-${randomUUID()}`;
const pollInterval = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2000);
const retryDelayMs = Number(process.env.WORKER_RETRY_DELAY_MS ?? 30_000);

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAndLockJob(): Promise<JobRow | null> {
  const supabase = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('dam_job_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('run_at', nowIso)
    .order('run_at', { ascending: true })
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const job = data[0];

  const { data: lockedRows, error: lockError } = await supabase
    .from('dam_job_queue')
    .update({
      status: 'processing',
      locked_at: new Date().toISOString(),
      locked_by: workerId,
    })
    .eq('id', job.id)
    .eq('status', 'pending')
    .select('*');

  if (lockError) throw lockError;
  if (!lockedRows || lockedRows.length === 0) {
    return null;
  }

  return lockedRows[0] as JobRow;
}

async function markJobComplete(job: JobRow) {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('dam_job_queue')
    .update({
      status: 'complete',
      attempts: job.attempts + 1,
      locked_at: null,
      locked_by: workerId,
      error: null,
    })
    .eq('id', job.id);

  if (error) throw error;
}

async function rescheduleJob(job: JobRow, err: unknown) {
  const supabase = getSupabaseServiceClient();
  const attempts = job.attempts + 1;
  const hasRetriesLeft = attempts < job.max_attempts;

  const updateFields: Record<string, unknown> = {
    attempts,
    locked_at: null,
    locked_by: null,
    error: err instanceof Error ? err.message : String(err),
  };

  if (hasRetriesLeft) {
    updateFields.status = 'pending';
    updateFields.run_at = new Date(Date.now() + retryDelayMs).toISOString();
  } else {
    updateFields.status = 'failed';
  }

  const { error } = await supabase
    .from('dam_job_queue')
    .update(updateFields)
    .eq('id', job.id);

  if (error) throw error;

  if (!hasRetriesLeft) {
    logger.error('Job permanently failed', { jobId: job.id, error: updateFields.error });
  }
}

async function markVersionFailed(versionId: string, reason: string) {
  const supabase = getSupabaseServiceClient();
  const { data: versionRow } = await supabase
    .from('dam_asset_versions')
    .select('metadata')
    .eq('id', versionId)
    .maybeSingle();

  const metadata = {
    ...(versionRow?.metadata ?? {}),
    failureReason: reason,
    failedAt: new Date().toISOString(),
  } as Record<string, unknown>;

  const { error } = await supabase
    .from('dam_asset_versions')
    .update({
      processing_status: 'failed',
      metadata,
    })
    .eq('id', versionId);

  if (error) {
    logger.error('Failed to mark asset version as failed', { versionId, error: error.message });
  }
}

async function handleJob(job: JobRow) {
  switch (job.job_name) {
    case 'dam.process-version':
      await processVersionJob(getSupabaseServiceClient(), job.payload as any, workerId);
      break;
    default:
      throw new Error(`Unknown job: ${job.job_name}`);
  }
}

async function workLoop() {
  logger.info('DAM worker started', { workerId, pollInterval, retryDelayMs });

  while (true) {
    try {
      const job = await fetchAndLockJob();
      if (!job) {
        await sleep(pollInterval);
        continue;
      }

      logger.info('Processing job', { jobId: job.id, jobName: job.job_name });
      try {
        await handleJob(job);
        await markJobComplete(job);
        logger.info('Job completed', { jobId: job.id });
      } catch (err) {
        logger.error('Job failed', { jobId: job.id, error: err instanceof Error ? err.message : err });
        await rescheduleJob(job, err);
        if (job.job_name === 'dam.process-version' && (job.payload as any)?.versionId) {
          await markVersionFailed((job.payload as any).versionId as string, err instanceof Error ? err.message : String(err));
        }
      }
    } catch (err) {
      logger.error('Worker loop error', { error: err instanceof Error ? err.message : err });
      await sleep(pollInterval);
    }
  }
}

workLoop().catch((err) => {
  logger.error('Fatal worker error', { error: err instanceof Error ? err.message : err });
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('Worker shutting down (SIGINT)');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Worker shutting down (SIGTERM)');
  process.exit(0);
});
