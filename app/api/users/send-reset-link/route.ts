/**
 * API Route: Send Password Setup/Reset Link to User (Admin)
 *
 * POST /api/users/send-reset-link
 *
 * Generates a long random token, stores it in password_setup_tokens with a
 * 24-hour expiry, and emails the user a link to /set-password?token=...
 *
 * IMPORTANT: This intentionally does NOT use Supabase's built-in magic-link
 * /recovery flow. Those tokens are single-use and get burned by corporate
 * email link-scanners (Microsoft Defender Safe Links, Mimecast, etc.) before
 * the user ever clicks. Our own token is only consumed when the user submits
 * the password form, not on URL load — scanners can hit the landing page
 * without invalidating anything.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { sendMail } from '../../../../lib/emailService';
import { passwordResetEmailTemplate, welcomeEmailTemplate } from '../../../../lib/emailTemplates';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';
import {
  SEND_RESET_LINK_RATE,
  SEND_RESET_LINK_ACTOR_GLOBAL_RATE,
  enforceRateLimit,
  normalizeEmailForRateLimit,
} from '../../../../platform/rateLimit';

const TOKEN_TTL_HOURS = 24;

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    const body = await request.json();
    const { userId, userEmail, userName, companyId, companyName } = body;

    if (!userId || !userEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: userId and userEmail' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createServiceRoleClient();
    const normalizedEmail = normalizeEmailForRateLimit(userEmail);

    const limited = await enforceRateLimit(supabaseAdmin, {
      key: `send-reset-link:actor:${admin.id}:email:${normalizedEmail}`,
      limit: SEND_RESET_LINK_RATE.limit,
      windowSeconds: SEND_RESET_LINK_RATE.windowSeconds,
    });
    if (!limited.ok) return limited.response;

    const globalLimit = await enforceRateLimit(supabaseAdmin, {
      key: `send-reset-link:actor:${admin.id}:global`,
      limit: SEND_RESET_LINK_ACTOR_GLOBAL_RATE.limit,
      windowSeconds: SEND_RESET_LINK_ACTOR_GLOBAL_RATE.windowSeconds,
    });
    if (!globalLimit.ok) return globalLimit.response;

    // Determine whether this is a new user (welcome flow) or an existing user (reset flow)
    const { data: authUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !authUser?.user) {
      console.error('[send-reset-link] failed to fetch user:', userError);
      return NextResponse.json(
        { error: `Failed to fetch user: ${userError?.message || 'unknown'}` },
        { status: 500 }
      );
    }
    const isNewUser = !authUser.user.last_sign_in_at;

    // Invalidate any previous unused tokens for this user — only the freshest
    // link should ever work, so old emails in the inbox become inert.
    await supabaseAdmin
      .from('password_setup_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('used_at', null);

    // Generate a fresh long random token (256 bits, URL-safe)
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin
      .from('password_setup_tokens')
      .insert({
        token,
        user_id: userId,
        expires_at: expiresAt,
        created_by: admin.id,
      });

    if (insertError) {
      console.error('[send-reset-link] failed to insert token:', insertError);
      return NextResponse.json(
        { error: `Failed to create password setup token: ${insertError.message}` },
        { status: 500 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const setupLink = `${siteUrl}/set-password?token=${token}`;

    let companyDisplayName = companyName;
    if (isNewUser && !companyDisplayName && companyId) {
      const { data: companyData } = await supabaseAdmin
        .from('companies')
        .select('company_name')
        .eq('id', companyId)
        .single();
      companyDisplayName = companyData?.company_name || 'Your Company';
    }

    const displayName = userName || normalizedEmail.split('@')[0];

    const emailTemplate = isNewUser
      ? welcomeEmailTemplate({
          userName: displayName,
          userEmail: normalizedEmail,
          companyName: companyDisplayName || 'Your Company',
          setupLink,
          siteUrl,
        })
      : passwordResetEmailTemplate({
          userName: displayName,
          userEmail: normalizedEmail,
          resetLink: setupLink,
          siteUrl,
        });

    const emailResult = await sendMail({
      to: normalizedEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    if (!emailResult.success) {
      console.error('[send-reset-link] sendMail failed:', emailResult.error);
      // Best-effort: drop the token we just created so a failed-email link can't be used later
      await supabaseAdmin.from('password_setup_tokens').delete().eq('token', token);
      return NextResponse.json(
        { error: `Failed to send email: ${emailResult.error}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: isNewUser
        ? 'Password setup link sent successfully'
        : 'Password reset link sent successfully',
      messageId: emailResult.messageId,
      isNewUser,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('[send-reset-link] error:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
