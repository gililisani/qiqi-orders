import { createClient } from '@supabase/supabase-js';
import type { QueueAdapter } from './index';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase queue driver requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

function createServiceClient() {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createSupabaseQueue(): QueueAdapter {
  return {
    async enqueue(job, payload, options) {
      const supabase = createServiceClient();
      const { error } = await supabase.from('dam_job_queue').insert({
        job_name: job,
        payload,
        run_at: options?.runAt ? options.runAt.toISOString() : new Date().toISOString(),
        max_attempts: options?.maxAttempts ?? 5,
      });

      if (error) {
        throw error;
      }
    },
  };
}
