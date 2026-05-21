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

    // Look up the auth user by email. Don't reveal whether they exist.
    const { data: usersList, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    // Note: listUsers doesn't support email filter directly; use admin.getUserByEmail-equivalent.
    // We'll do it via the database instead.
    if (listError) {
      console.error('[request-login-code] listUsers error:', listError);
    }

    // Direct lookup by email — auth.users is accessible via admin client
    const { data: userRow, error: userLookupError } = await supabaseAdmin
      .schema('auth')
      .from('users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    // Verify user is a CLIENT (and enabled). If not, silently succeed.
    let clientUserId: string | null = null;
    if (!userLookupError && userRow) {
      const { data: clientRow } = await supabaseAdmin
        .from('clients')
        .select('id, enabled, name')
        .eq('id', userRow.id)
        .eq('enabled', true)
        .maybeSingle();
      if (clientRow) {
        clientUserId = userRow.id as string;
      }
    }

    // Whether we found a client or not, return success.
    if (!clientUserId) {
      // Pretend we sent it. This is intentional — prevents leaking which emails
      // belong to clients.
      return NextResponse.json({ success: true });
    }

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

    // Look up display name from clients table for friendlier email
    const { data: clientNameRow } = await supabaseAdmin
      .from('clients')
      .select('name')
      .eq('id', clientUserId)
      .maybeSingle();
    const displayName = clientNameRow?.name || email.split('@')[0];

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
      console.error('[request-login-code] sendMail failed:', result.error);
      // Roll back the code so it can't be used (best-effort)
      await supabaseAdmin
        .from('login_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('user_id', clientUserId)
        .eq('code_hash', codeHash);
      return NextResponse.json({ error: 'Could not send code email.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[request-login-code] error:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
