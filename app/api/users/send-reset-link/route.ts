/**
 * API Route: Send Password Setup/Reset Link to User (Admin)
 * 
 * POST /api/users/send-reset-link
 * 
 * Admin can send a password setup link (for new users) or reset link (for existing users) to any user.
 * Supabase uses 'recovery' type for both scenarios, but we use appropriate email templates.
 * This is useful when editing users or when a user needs a new setup/reset link.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendMail } from '../../../../lib/emailService';
import { passwordResetEmailTemplate, welcomeEmailTemplate } from '../../../../lib/emailTemplates';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';
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

    // Validate input
    if (!userId || !userEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: userId and userEmail' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createServiceRoleClient();
    const normalizedEmail = normalizeEmailForRateLimit(userEmail);

    // Limit per actor + target email to prevent spamming reset/setup links.
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

    // Check if this is a new user (never set their password)
    // New users: last_sign_in_at is null (they've never successfully logged in)
    // Existing users: last_sign_in_at has a value (they've logged in before)
    const { data: authUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (userError) {
      console.error('Failed to fetch user:', userError);
      return NextResponse.json(
        { error: `Failed to fetch user: ${userError.message}` },
        { status: 500 }
      );
    }

    const isNewUser = !authUser.user.last_sign_in_at;

    // Generate password setup/reset link using Supabase admin API
    // Supabase uses 'recovery' type for both new user setup and password reset
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/confirm-password-reset`
      }
    });

    if (linkError) {
      console.error('Failed to generate link:', linkError);
      return NextResponse.json(
        { error: `Failed to generate password link: ${linkError.message}` },
        { status: 500 }
      );
    }

    // Get user name if not provided
    let displayName = userName || normalizedEmail.split('@')[0];
    
    // Get company name if not provided and needed
    let companyDisplayName = companyName;
    if (isNewUser && !companyDisplayName && companyId) {
      const { data: companyData } = await supabaseAdmin
        .from('companies')
        .select('company_name')
        .eq('id', companyId)
        .single();
      
      companyDisplayName = companyData?.company_name || 'Your Company';
    }

    // Send appropriate email based on whether user is new or existing
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    let emailTemplate;
    
    if (isNewUser) {
      // New user: send welcome email with "Set Your Password"
      emailTemplate = welcomeEmailTemplate({
        userName: displayName,
        userEmail: normalizedEmail,
        companyName: companyDisplayName || 'Your Company',
        setupLink: linkData.properties.action_link,
        siteUrl: siteUrl
      });
    } else {
      // Existing user: send password reset email
      emailTemplate = passwordResetEmailTemplate({
        userName: displayName,
        userEmail: normalizedEmail,
        resetLink: linkData.properties.action_link,
        siteUrl: siteUrl
      });
    }

    const emailResult = await sendMail({
      to: normalizedEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html
    });

    if (!emailResult.success) {
      console.error('Failed to send email:', emailResult.error);
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
      isNewUser: isNewUser
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error in send-reset-link API:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

