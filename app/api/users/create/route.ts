import { NextRequest, NextResponse } from 'next/server';
import { sendMail } from '../../../../lib/emailService';
import { welcomeEmailTemplate } from '../../../../lib/emailTemplates';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const logContext = {
    timestamp: new Date().toISOString(),
    operation: 'create_user'
  };

  let authUserId: string | null = null;
  let profileCreated = false;
  const supabaseAdmin = createServiceRoleClient();

  const rollback = async (reason: string) => {
    try {
      if (profileCreated && authUserId) {
        await supabaseAdmin.rpc('delete_user_cascade', { p_user_id: authUserId });
      }
      if (authUserId) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      }
    } catch (cleanupErr: any) {
      console.error('[USER_CREATE] Rollback failure after:', reason, cleanupErr?.message);
    }
  };

  try {
    await requireAdmin(request);

    const { name, email, companyId, enabled } = await request.json();

    if (!name || !email || !companyId) {
      return NextResponse.json(
        { error: 'Missing required fields: name, email, and companyId' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    console.log('[USER_CREATE] Starting:', { ...logContext, email, companyId });

    // Generate a secure random password the user will never see.
    const randomPassword = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true,
      user_metadata: { full_name: name }
    });

    if (authError) {
      console.error('[USER_CREATE] Auth user creation failed:', { ...logContext, error: authError.message });
      if (authError.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'A user with this email already exists. Please use a different email.' },
          { status: 400 }
        );
      }
      throw authError;
    }
    if (!authData.user) throw new Error('Failed to create user account');
    authUserId = authData.user.id;

    // Atomic: company existence check + clients row insert.
    const { error: rpcError } = await supabaseAdmin.rpc('create_client_profile', {
      p_user_id: authUserId,
      p_name: name,
      p_email: email,
      p_company_id: companyId,
      p_enabled: enabled ?? true,
    });

    if (rpcError) {
      console.error('[USER_CREATE] Profile RPC failed:', { ...logContext, error: rpcError.message });
      await rollback('profile_rpc_failed');
      authUserId = null;
      const isFkError = rpcError.code === '23503' || rpcError.message?.includes('company');
      return NextResponse.json(
        { error: isFkError ? 'Company not found' : 'Failed to create user profile' },
        { status: isFkError ? 400 : 500 }
      );
    }
    profileCreated = true;

    // Generate password setup link.
    const { data: setupData, error: setupError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/confirm-password-reset`
      }
    });

    if (setupError || !setupData?.properties?.action_link) {
      console.error('[USER_CREATE] Setup link failed:', { ...logContext, error: setupError?.message });
      await rollback('setup_link_failed');
      return NextResponse.json(
        { error: 'Failed to generate password setup link. User was not created.' },
        { status: 500 }
      );
    }

    // Fetch company name for the email body (non-fatal if missing).
    const { data: companyData } = await supabaseAdmin
      .from('companies')
      .select('company_name')
      .eq('id', companyId)
      .single();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const emailTemplate = welcomeEmailTemplate({
      userName: name,
      userEmail: email,
      companyName: companyData?.company_name || 'Your Company',
      setupLink: setupData.properties.action_link,
      siteUrl,
    });

    const emailResult = await sendMail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html
    });

    if (!emailResult.success) {
      console.error('[USER_CREATE] Welcome email failed:', { ...logContext, error: emailResult.error });
      await rollback('welcome_email_failed');
      return NextResponse.json(
        { error: 'Failed to send welcome email. User was not created. Please retry.' },
        { status: 502 }
      );
    }

    console.log('[USER_CREATE] SUCCESS:', {
      ...logContext,
      userId: authUserId,
      companyId,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      userId: authUserId,
      message: 'User created successfully and setup email sent'
    });

  } catch (error: any) {
    if (error instanceof Response) return error;
    await rollback('unhandled_exception');
    console.error('[USER_CREATE] ERROR:', {
      ...logContext,
      error: error?.message,
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: error?.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}
