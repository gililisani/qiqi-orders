/**
 * API Route: Check User Role (for two-step login UI)
 *
 * POST /api/auth/check-user
 * Body: { email: string }
 *
 * Returns the role to display to the user on the login page:
 *  - 'admin'   → user exists in admins (enabled)
 *  - 'client'  → user exists in clients (enabled) OR doesn't exist at all
 *
 * Unknown emails are intentionally bucketed with clients so the login UI
 * doesn't leak "this email is not registered". The attempt to log in then
 * fails at Supabase's signInWithPassword like any wrong password would.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import {
  CHECK_USER_PER_IP_RATE,
  enforceRateLimit,
  getClientIp,
  normalizeEmailForRateLimit,
} from '../../../../platform/rateLimit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawEmail = body?.email;

    if (!rawEmail || typeof rawEmail !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const email = normalizeEmailForRateLimit(rawEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email.' }, { status: 400 });
    }

    const supabaseAdmin = createServiceRoleClient();

    // IP rate limit — slows email enumeration of admin accounts
    const ipLimit = await enforceRateLimit(supabaseAdmin, {
      key: `check-user:ip:${getClientIp(request)}`,
      limit: CHECK_USER_PER_IP_RATE.limit,
      windowSeconds: CHECK_USER_PER_IP_RATE.windowSeconds,
    });
    if (!ipLimit.ok) return ipLimit.response;

    // Check admins first (small list, fast). If found and enabled → 'admin'.
    const { data: adminRow } = await supabaseAdmin
      .from('admins')
      .select('id, enabled')
      .eq('email', email)
      .eq('enabled', true)
      .maybeSingle();

    if (adminRow) {
      return NextResponse.json({ role: 'admin' });
    }

    // Everyone else (clients + unknown emails) gets the client UI
    return NextResponse.json({ role: 'client' });
  } catch (error: any) {
    console.error('[check-user] error:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
