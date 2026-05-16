import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { enforceRateLimit } from '@/platform/rateLimit';
import { createMockSupabase } from '../helpers/mockSupabase';

const KEY_OPTS = { key: 'test-key', limit: 5, windowSeconds: 3600 };

describe('enforceRateLimit', () => {
  const originalEnv = process.env.RATE_LIMIT_LENIENT;

  beforeEach(() => {
    delete process.env.RATE_LIMIT_LENIENT;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.RATE_LIMIT_LENIENT;
    else process.env.RATE_LIMIT_LENIENT = originalEnv;
  });

  it('passes when RPC returns allowed=true', async () => {
    const supabase = createMockSupabase({
      rpc: {
        consume_rate_limit: () => ({
          data: { allowed: true, current_count: 1, retry_after_seconds: 0 },
          error: null,
        }),
      },
    });

    const result = await enforceRateLimit(supabase, KEY_OPTS);
    expect(result.ok).toBe(true);
  });

  it('returns 429 with Retry-After header when over limit', async () => {
    const supabase = createMockSupabase({
      rpc: {
        consume_rate_limit: () => ({
          data: { allowed: false, current_count: 6, retry_after_seconds: 120 },
          error: null,
        }),
      },
    });

    const result = await enforceRateLimit(supabase, KEY_OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(429);
      expect(result.response.headers.get('Retry-After')).toBe('120');
    }
  });

  it('FAILS CLOSED with 503 when RPC errors (no env override)', async () => {
    // This is the regression test for the Tier 0 fix. Previously the
    // code fell back to "allow" silently if the migration was missing
    // or the RPC errored; now it must hard-fail.
    const supabase = createMockSupabase({
      rpc: {
        consume_rate_limit: () => ({
          data: null,
          error: { message: 'function does not exist' },
        }),
      },
    });

    const result = await enforceRateLimit(supabase, KEY_OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
    }
  });

  it('falls back to allow when RATE_LIMIT_LENIENT=true is set explicitly', async () => {
    process.env.RATE_LIMIT_LENIENT = 'true';
    const supabase = createMockSupabase({
      rpc: {
        consume_rate_limit: () => ({
          data: null,
          error: { message: 'function does not exist' },
        }),
      },
    });

    const result = await enforceRateLimit(supabase, KEY_OPTS);
    expect(result.ok).toBe(true);
  });

  it('fails closed on unexpected RPC payload shape', async () => {
    const supabase = createMockSupabase({
      rpc: {
        consume_rate_limit: () => ({ data: 'garbage', error: null }),
      },
    });

    const result = await enforceRateLimit(supabase, KEY_OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
    }
  });
});
