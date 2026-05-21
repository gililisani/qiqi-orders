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
import { sendMail } from '../../../../lib/emailService';
import { passwordResetEmailTemplate, welcomeEmailTemplate } from '../../../../lib/emailTemplates';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';
import { createPasswordSetupLink, deletePasswordSetupToken } from '../../../../lib/passwordSetupTokens';
import {
  SEND_RESET_LINK_RATE,
  SEND_RESET_LINK_ACTOR_GLOBAL_RATE,
  enforceRateLimit,
  normalizeEmailForRateLimit,
} from '../../../../platform/rateLimit';

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

    let setupLink: { url: string; token: string };
    try {
      setupLink = await createPasswordSetupLink(supabaseAdmin, {
        userId,
        createdBy: admin.id,
      });
    } catch (linkErr: any) {
      console.error('[send-reset-link] createPasswordSetupLink:', linkErr);
      return NextResponse.json(
        { error: linkErr?.message || 'Failed to create password setup token.' },
        { status: 500 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

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
          setupLink: setupLink.url,
          siteUrl,
        })
      : passwordResetEmailTemplate({
          userName: displayName,
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
      console.error('[send-reset-link] sendMail failed:', emailResult.error);
      await deletePasswordSetupToken(supabaseAdmin, setupLink.token);
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
