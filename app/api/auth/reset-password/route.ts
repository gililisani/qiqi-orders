/**
 * API Route: Request Password Reset (public Forgot Password flow)
 *
 * POST /api/auth/reset-password
 * Body: { email: string }
 *
 * Generates a custom password-reset token (NOT a Supabase magic link), stores
 * it in password_setup_tokens, and emails the URL to the user.
 *
 * Returns the same generic success message whether or not the email matches
 * a real account (anti-enumeration).
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendMail } from '../../../../lib/emailService';
import { passwordResetEmailTemplate } from '../../../../lib/emailTemplates';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { createPasswordSetupLink, deletePasswordSetupToken } from '../../../../lib/passwordSetupTokens';
import {
  RESET_PASSWORD_RATE,
  enforceRateLimit,
  getClientIp,
  normalizeEmailForRateLimit,
} from '../../../../platform/rateLimit';

const GENERIC_SUCCESS = {
  success: true,
  message: 'If an account with that email exists, a password reset link has been sent.',
} as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabaseAdmin = createServiceRoleClient();
    const normalizedEmail = normalizeEmailForRateLimit(email);

    const rateKey = `reset-password:ip:${getClientIp(request)}:email:${normalizedEmail}`;
    const limited = await enforceRateLimit(supabaseAdmin, {
      key: rateKey,
      limit: RESET_PASSWORD_RATE.limit,
      windowSeconds: RESET_PASSWORD_RATE.windowSeconds,
    });
    if (!limited.ok) return limited.response;

    // Look up the user by email. Use the auth schema directly — listUsers()
    // is paginated and would silently skip most accounts.
    const { data: userRow } = await supabaseAdmin
      .schema('auth')
      .from('users')
      .select('id, email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    // Whether or not the user exists, return the same generic success
    // message to prevent email enumeration.
    if (!userRow) {
      return NextResponse.json(GENERIC_SUCCESS);
    }

    let setupLink: { url: string; token: string };
    try {
      setupLink = await createPasswordSetupLink(supabaseAdmin, {
        userId: userRow.id as string,
        createdBy: null,
      });
    } catch (linkErr: any) {
      console.error('[reset-password] createPasswordSetupLink:', linkErr);
      return NextResponse.json(
        { error: 'Failed to generate password reset link. Please try again later.' },
        { status: 500 }
      );
    }

    // Resolve display name (best-effort)
    let userName = normalizedEmail.split('@')[0];
    try {
      const { data: clientData } = await supabaseAdmin
        .from('clients')
        .select('name')
        .eq('email', normalizedEmail)
        .maybeSingle();
      if (clientData?.name) {
        userName = clientData.name;
      } else {
        const { data: adminData } = await supabaseAdmin
          .from('admins')
          .select('name')
          .eq('email', normalizedEmail)
          .maybeSingle();
        if (adminData?.name) userName = adminData.name;
      }
    } catch {
      /* fall through with email prefix */
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const emailTemplate = passwordResetEmailTemplate({
      userName,
      userEmail: normalizedEmail,
      resetLink: setupLink.url,
      siteUrl,
    });

    const emailResult = await sendMail({
      to: normalizedEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    if (!emailResult.success) {
      console.error('[reset-password] sendMail failed:', emailResult.error);
      await deletePasswordSetupToken(supabaseAdmin, setupLink.token);
      return NextResponse.json(
        { error: 'Failed to send password reset email. Please try again later.' },
        { status: 500 }
      );
    }

    return NextResponse.json(GENERIC_SUCCESS);
  } catch (error: any) {
    console.error('[reset-password] error:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
