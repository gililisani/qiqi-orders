import { createSupabaseQueue } from './supabase';

export interface QueueAdapter {
  enqueue(job: string, payload: Record<string, unknown>, options?: { runAt?: Date; maxAttempts?: number }): Promise<void>;
}

export function createQueue(): QueueAdapter {
  const driver = (process.env.QUEUE_DRIVER ?? 'supabase').toLowerCase();
  switch (driver) {
    case 'supabase':
      return createSupabaseQueue();
    default:
      console.warn(`Unknown QUEUE_DRIVER '${driver}', falling back to supabase`);
      return createSupabaseQueue();
  }
}
