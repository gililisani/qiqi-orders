/**
 * API Route: Resend welcome / password-setup email (admin)
 *
 * POST /api/users/send-welcome-email
 * Body: { userId: string }
 *
 * Sends the same style of welcome email as user creation: password setup link from Supabase,
 * not plaintext passwords. Recipient address and identity come only from Auth + DB records.
 * Auth: admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';
import { sendMail } from '../../../../lib/emailService';
import { welcomeEmailTemplate } from '../../../../lib/emailTemplates';
import {
  SEND_WELCOME_EMAIL_RATE,
  SEND_WELCOME_EMAIL_ACTOR_GLOBAL_RATE,
  enforceRateLimit,
  normalizeEmailForRateLimit,
} from '../../../../platform/rateLimit';

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    const body = await request.json();
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required field: userId' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createServiceRoleClient();

    const { data: authLookup, error: authLookupError } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (authLookupError) {
      console.error('[send-welcome-email] getUserById:', authLookupError);
      return NextResponse.json(
        { error: `Failed to load user: ${authLookupError.message}` },
        { status: 500 }
      );
    }

    if (!authLookup?.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const authUser = authLookup.user;
    const canonicalEmail = authUser.email?.trim();

    if (!canonicalEmail) {
      return NextResponse.json(
        { error: 'User has no email address in Auth; cannot send welcome email' },
        { status: 400 }
      );
    }

    // Limit per actor + target user/email to avoid welcome-email spam.
    const limited = await enforceRateLimit(supabaseAdmin, {
      key: `send-welcome-email:actor:${admin.id}:user:${userId}:email:${normalizeEmailForRateLimit(canonicalEmail)}`,
      limit: SEND_WELCOME_EMAIL_RATE.limit,
      windowSeconds: SEND_WELCOME_EMAIL_RATE.windowSeconds,
    });
    if (!limited.ok) return limited.response;

    const globalLimit = await enforceRateLimit(supabaseAdmin, {
      key: `send-welcome-email:actor:${admin.id}:global`,
      limit: SEND_WELCOME_EMAIL_ACTOR_GLOBAL_RATE.limit,
      windowSeconds: SEND_WELCOME_EMAIL_ACTOR_GLOBAL_RATE.windowSeconds,
    });
    if (!globalLimit.ok) return globalLimit.response;

    // Welcome flow is for client portal accounts only (row in `clients`)
    const { data: clientRow, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id, name, email, company_id, enabled')
      .eq('id', userId)
      .maybeSingle();

    if (clientError) {
      console.error('[send-welcome-email] clients lookup:', clientError);
      return NextResponse.json({ error: 'Failed to load client profile' }, { status: 500 });
    }

    if (!clientRow) {
      return NextResponse.json(
        {
          error:
            'No client profile for this user. Welcome email is only for company client accounts.',
        },
        { status: 404 }
      );
    }

    if (clientRow.enabled === false) {
      return NextResponse.json(
        { error: 'User is disabled; enable the account before sending a welcome email.' },
        { status: 400 }
      );
    }

    // Align with "new user" semantics: never logged in successfully
    if (authUser.last_sign_in_at) {
      return NextResponse.json(
        {
          error:
            'This user has already signed in. Use “Send password reset” instead of welcome email.',
        },
        { status: 400 }
      );
    }

    if (
      clientRow.email &&
      clientRow.email.toLowerCase() !== canonicalEmail.toLowerCase()
    ) {
      console.warn('[send-welcome-email] clients.email differs from Auth email; using Auth email', {
        userId,
      });
    }

    const displayName =
      clientRow.name?.trim() ||
      (typeof authUser.user_metadata?.full_name === 'string'
        ? authUser.user_metadata.full_name
        : '') ||
      canonicalEmail.split('@')[0];

    const { data: companyData } = await supabaseAdmin
      .from('companies')
      .select('company_name')
      .eq('id', clientRow.company_id)
      .maybeSingle();

    const companyName = companyData?.company_name?.trim() || 'Your Company';

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: canonicalEmail,
      options: {
        redirectTo: `${siteUrl}/confirm-password-reset`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[send-welcome-email] generateLink:', linkError);
      return NextResponse.json(
        { error: linkError?.message || 'Failed to generate password setup link' },
        { status: 500 }
      );
    }

    const emailTemplate = welcomeEmailTemplate({
      userName: displayName,
      userEmail: canonicalEmail,
      companyName,
      setupLink: linkData.properties.action_link,
      siteUrl,
    });

    const result = await sendMail({
      to: canonicalEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Welcome email sent successfully',
      messageId: result.messageId,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error sending welcome email:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send welcome email' },
      { status: 500 }
    );
  }
}
