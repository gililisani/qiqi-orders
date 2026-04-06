import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Password reset: per client IP + target email (abuse: email bombing, Supabase admin spam). */
export const RESET_PASSWORD_RATE = {
  limit: 5,
  windowSeconds: 3600,
} as const;

/** Order marketing/status email: per actor + order + recipient (abuse: spamming customer inboxes). */
export const SEND_ORDER_EMAIL_RATE = {
  limit: 30,
  windowSeconds: 3600,
} as const;

/** Order email: global per actor (fan-out abuse). */
export const SEND_ORDER_EMAIL_ACTOR_GLOBAL_RATE = {
  limit: 50,
  windowSeconds: 3600,
} as const;

/** Admin-triggered password reset/setup: per actor + target email. */
export const SEND_RESET_LINK_RATE = {
  limit: 5,
  windowSeconds: 3600,
} as const;

/** Admin reset-link: global per actor (fan-out abuse). */
export const SEND_RESET_LINK_ACTOR_GLOBAL_RATE = {
  limit: 20,
  windowSeconds: 3600,
} as const;

/** Admin-triggered welcome email resend: per actor + target user. */
export const SEND_WELCOME_EMAIL_RATE = {
  limit: 3,
  windowSeconds: 3600,
} as const;

/** Admin welcome-email: global per actor (fan-out abuse). */
export const SEND_WELCOME_EMAIL_ACTOR_GLOBAL_RATE = {
  limit: 10,
  windowSeconds: 3600,
} as const;

/** Internal-team notification email: per actor + order. */
export const SEND_ORDER_NOTIFICATION_RATE = {
  limit: 10,
  windowSeconds: 3600,
} as const;

/** Order internal notification: global per actor (fan-out abuse). */
export const SEND_ORDER_NOTIFICATION_ACTOR_GLOBAL_RATE = {
  limit: 30,
  windowSeconds: 3600,
} as const;

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim().slice(0, 128);
  return 'unknown';
}

export function normalizeEmailForRateLimit(email: string): string {
  return String(email ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 320);
}

type ConsumeResult = {
  allowed: boolean;
  current_count?: number;
  retry_after_seconds: number;
};

/**
 * Fixed-window rate limit via Postgres RPC `consume_rate_limit`.
 * Requires migration `20260407120000_api_rate_limits.sql`.
 */
export async function enforceRateLimit(
  supabase: SupabaseClient,
  options: {
    key: string;
    limit: number;
    windowSeconds: number;
  }
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const key = options.key.slice(0, 512);

  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_key: key,
    p_window_seconds: options.windowSeconds,
    p_limit: options.limit,
  });

  if (error) {
    console.error('[rateLimit] consume_rate_limit RPC failed', error.message);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Service temporarily unavailable. Please try again later.' },
        { status: 503 }
      ),
    };
  }

  const row = data as ConsumeResult | null;
  if (!row || typeof row.allowed !== 'boolean') {
    console.error('[rateLimit] unexpected RPC payload');
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Service temporarily unavailable. Please try again later.' },
        { status: 503 }
      ),
    };
  }

  if (!row.allowed) {
    const retry = Math.max(1, Math.ceil(Number(row.retry_after_seconds) || 60));
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(retry) },
        }
      ),
    };
  }

  return { ok: true };
}
