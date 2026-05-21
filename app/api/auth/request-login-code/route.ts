/**
 * API Route: Request One-Time Login Code (clients only)
 *
 * POST /api/auth/request-login-code
 * Body: { email: string }
 *
 * Generates a 6-digit code, stores its SHA-256 hash with a 10-minute expiry,
 * and emails it via Microsoft Graph. The code itself is the credential —
 * we never send a clickable login link, so email scanners can't burn anything.
 *
 * Restricted to CLIENT accounts. Admins must use the normal password flow.
 *
 * Always returns 200 with `{ success: true }` regardless of whether the email
 * corresponds to a real client — prevents enumeration of valid emails.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { sendMail } from '../../../../lib/emailService';
import { loginCodeEmailTemplate } from '../../../../lib/emailTemplates';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import {
  REQUEST_LOGIN_CODE_PER_EMAIL_RATE,
  REQUEST_LOGIN_CODE_PER_IP_RATE,
  enforceRateLimit,
  normalizeEmailForRateLimit,
  getClientIp,
} from '../../../../platform/rateLimit';

const CODE_TTL_MINUTES = 10;

function generateSixDigitCode(): string {
  // 100000..999999 — uniform across that range via rejection-free modulo
  // (acceptable bias is far below useful here)
  const n = crypto.randomInt(0, 900000) + 100000;
  return n.toString();
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawEmail = body?.email;

    if (!rawEmail || typeof rawEmail !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const email = normalizeEmailForRateLimit(rawEmail);
    if (!email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email.' }, { status: 400 });
    }

    const supabaseAdmin = createServiceRoleClient();

    // Rate limit by IP (anti-enumeration / volume) and by target email (anti-bombing)
    const ip = getClientIp(request);
    const ipLimit = await enforceRateLimit(supabaseAdmin, {
      key: `request-login-code:ip:${ip}`,
      limit: REQUEST_LOGIN_CODE_PER_IP_RATE.limit,
      windowSeconds: REQUEST_LOGIN_CODE_PER_IP_RATE.windowSeconds,
    });
    if (!ipLimit.ok) return ipLimit.response;

    const emailLimit = await enforceRateLimit(supabaseAdmin, {
      key: `request-login-code:email:${email}`,
      limit: REQUEST_LOGIN_CODE_PER_EMAIL_RATE.limit,
      windowSeconds: REQUEST_LOGIN_CODE_PER_EMAIL_RATE.windowSeconds,
    });
    if (!emailLimit.ok) return emailLimit.response;

    // Look up via the clients table (public schema). The auth schema isn't
    // exposed through the JS client by default, so we can't hit auth.users
    // directly. clients.id is the auth user id and clients.email is the
    // canonical email for client users.
    const { data: clientRow, error: clientLookupError } = await supabaseAdmin
      .from('clients')
      .select('id, name, enabled, email')
      .eq('email', email)
      .eq('enabled', true)
      .maybeSingle();

    if (clientLookupError) {
      console.error('[request-login-code] clients lookup error:', clientLookupError);
    }

    if (!clientRow) {
      // Log the miss server-side (helps debug), but return generic success
      // to the caller so we don't leak which emails belong to clients.
      console.log('[request-login-code] no enabled client for email (not sending code):', email);
      return NextResponse.json({ success: true });
    }

    const clientUserId = clientRow.id as string;

    // Invalidate any previous unused codes for this user — only the newest works
    await supabaseAdmin
      .from('login_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', clientUserId)
      .is('used_at', null);

    const code = generateSixDigitCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin
      .from('login_codes')
      .insert({
        user_id: clientUserId,
        code_hash: codeHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error('[request-login-code] insert error:', insertError);
      return NextResponse.json({ error: 'Could not generate code.' }, { status: 500 });
    }

    const displayName = clientRow.name || email.split('@')[0];

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const template = loginCodeEmailTemplate({
      userName: displayName,
      userEmail: email,
      code,
      siteUrl,
    });

    const result = await sendMail({
      to: email,
      subject: template.subject,
      html: template.html,
    });

    if (!result.success) {
      console.error('[request-login-code] sendMail failed for', email, ':', result.error);
      // Roll back the code so it can't be used (best-effort)
      await supabaseAdmin
        .from('login_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('user_id', clientUserId)
        .eq('code_hash', codeHash);
      return NextResponse.json({ error: 'Could not send code email.' }, { status: 500 });
    }

    console.log('[request-login-code] code sent to', email);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[request-login-code] error:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
