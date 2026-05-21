/**
 * API Route: Verify One-Time Login Code (clients only)
 *
 * POST /api/auth/verify-login-code
 * Body: { email: string, code: string }
 *
 * Validates the 6-digit code, enforces attempt limits, and exchanges it for
 * a Supabase session. The magic-link OTP is generated and redeemed entirely
 * server-side — the user never sees it in their inbox, so link-scanners
 * can't consume it.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import {
  VERIFY_LOGIN_CODE_PER_IP_RATE,
  enforceRateLimit,
  normalizeEmailForRateLimit,
  getClientIp,
} from '../../../../platform/rateLimit';

const MAX_ATTEMPTS_PER_CODE = 5;

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawEmail = body?.email;
    const rawCode = body?.code;

    if (!rawEmail || typeof rawEmail !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }
    if (!rawCode || typeof rawCode !== 'string') {
      return NextResponse.json({ error: 'Code is required.' }, { status: 400 });
    }

    const email = normalizeEmailForRateLimit(rawEmail);
    const code = rawCode.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Code must be 6 digits.' }, { status: 400 });
    }

    const supabaseAdmin = createServiceRoleClient();

    // Brute-force protection on the 6-digit space (1M combos)
    const ip = getClientIp(request);
    const ipLimit = await enforceRateLimit(supabaseAdmin, {
      key: `verify-login-code:ip:${ip}`,
      limit: VERIFY_LOGIN_CODE_PER_IP_RATE.limit,
      windowSeconds: VERIFY_LOGIN_CODE_PER_IP_RATE.windowSeconds,
    });
    if (!ipLimit.ok) return ipLimit.response;

    // Look up auth user by email
    const { data: userRow } = await supabaseAdmin
      .schema('auth')
      .from('users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (!userRow) {
      return NextResponse.json({ error: 'Invalid code.' }, { status: 400 });
    }

    // Confirm the account is an enabled client
    const { data: clientRow } = await supabaseAdmin
      .from('clients')
      .select('id, enabled')
      .eq('id', userRow.id)
      .eq('enabled', true)
      .maybeSingle();

    if (!clientRow) {
      return NextResponse.json({ error: 'Invalid code.' }, { status: 400 });
    }

    // Find the latest unused code for this user
    const { data: codeRow, error: codeError } = await supabaseAdmin
      .from('login_codes')
      .select('id, code_hash, expires_at, used_at, attempts')
      .eq('user_id', userRow.id)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeError) {
      console.error('[verify-login-code] code lookup error:', codeError);
      return NextResponse.json({ error: 'Could not verify code.' }, { status: 500 });
    }
    if (!codeRow) {
      return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 });
    }

    // Expiry check
    if (new Date(codeRow.expires_at).getTime() < Date.now()) {
      await supabaseAdmin
        .from('login_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', codeRow.id);
      return NextResponse.json(
        { error: 'This code has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Attempts check
    if (codeRow.attempts >= MAX_ATTEMPTS_PER_CODE) {
      await supabaseAdmin
        .from('login_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', codeRow.id);
      return NextResponse.json(
        { error: 'Too many attempts. Please request a new code.' },
        { status: 400 }
      );
    }

    // Compare
    const submittedHash = hashCode(code);
    const matches = crypto.timingSafeEqual(
      Buffer.from(submittedHash, 'hex'),
      Buffer.from(codeRow.code_hash, 'hex')
    );

    if (!matches) {
      await supabaseAdmin
        .from('login_codes')
        .update({ attempts: codeRow.attempts + 1 })
        .eq('id', codeRow.id);
      const remaining = MAX_ATTEMPTS_PER_CODE - (codeRow.attempts + 1);
      return NextResponse.json(
        {
          error:
            remaining > 0
              ? `Incorrect code. ${remaining} attempt(s) remaining.`
              : 'Incorrect code. Please request a new one.',
        },
        { status: 400 }
      );
    }

    // SUCCESS — mark the code used
    await supabaseAdmin
      .from('login_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', codeRow.id);

    // Exchange for a Supabase session via admin magic-link + immediate OTP redemption.
    // The magic link is generated and consumed entirely server-side, so it never hits
    // the user's inbox and can't be intercepted by email scanners.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[verify-login-code] generateLink failed:', linkError);
      return NextResponse.json({ error: 'Could not create session.' }, { status: 500 });
    }

    const supabasePublic = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: otpData, error: otpError } = await supabasePublic.auth.verifyOtp({
      type: 'magiclink',
      email,
      token_hash: linkData.properties.hashed_token,
    });

    if (otpError || !otpData?.session) {
      console.error('[verify-login-code] verifyOtp failed:', otpError);
      return NextResponse.json({ error: 'Could not create session.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      session: {
        access_token: otpData.session.access_token,
        refresh_token: otpData.session.refresh_token,
      },
    });
  } catch (error: any) {
    console.error('[verify-login-code] error:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
