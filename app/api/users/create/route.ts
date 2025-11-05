import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendMail } from '../../../../lib/emailService';
import { welcomeEmailTemplate } from '../../../../lib/emailTemplates';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const logContext = {
    timestamp: new Date().toISOString(),
    operation: 'create_user'
  };

  try {
    const { name, email, companyId, enabled } = await request.json();

    // Validate input
    if (!name || !email || !companyId) {
      console.error('[USER_CREATE] Validation failed:', { ...logContext, name: !!name, email: !!email, companyId: !!companyId });
      return NextResponse.json(
        { error: 'Missing required fields: name, email, and companyId' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('[USER_CREATE] Invalid email format:', { ...logContext, email });
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    console.log('[USER_CREATE] Starting user creation:', { ...logContext, email, companyId, name });

    // Create Supabase admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Generate a secure random password that user will never see
    const randomPassword = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);

    // Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true,
      user_metadata: {
        full_name: name
      }
    });

    if (authError) {
      console.error('[USER_CREATE] Auth user creation failed:', { ...logContext, email, error: authError.message });
      if (authError.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'A user with this email already exists. Please use a different email.' },
          { status: 400 }
        );
      }
      throw authError;
    }

    if (!authData.user) {
      console.error('[USER_CREATE] Auth user creation returned no user:', { ...logContext, email });
      throw new Error('Failed to create user account');
    }

    console.log('[USER_CREATE] Auth user created:', { ...logContext, userId: authData.user.id, email });

    // Create the client profile in our clients table
    const { error: profileError } = await supabaseAdmin
      .from('clients')
      .insert([{
        id: authData.user.id,
        name,
        email,
        enabled: enabled ?? true,
        company_id: companyId
      }]);

    if (profileError) {
      console.error('[USER_CREATE] Profile creation failed, cleaning up auth user:', { ...logContext, userId: authData.user.id, error: profileError.message });
      // If profile creation fails, clean up the auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    console.log('[USER_CREATE] Profile created:', { ...logContext, userId: authData.user.id });

    // Generate password setup link using Supabase admin API
    // Note: Supabase uses 'recovery' type for both new user password setup and password reset
    // For new users, this is a "password setup link" (not a reset link)
    // Link expiration is controlled by Supabase's JWT expiry setting
    // Default is 1 hour (3600 seconds). To set 24 hours (86400 seconds):
    // - Check Authentication → Advanced settings in Supabase Dashboard
    // - Or contact Supabase support if setting is not visible (may require paid plan)
    // - The generateLink API does not support custom expiration time
    const { data: setupData, error: setupError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery', // Supabase uses 'recovery' for both setup and reset
      email: email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/confirm-password-reset`
      }
    });

    if (setupError) {
      console.error('[USER_CREATE] Failed to generate password setup link:', { ...logContext, userId: authData.user.id, email, error: setupError.message });
      return NextResponse.json({
        success: true,
        userId: authData.user.id,
        warning: 'User created but failed to generate password setup link. Please use "Send Password Reset Email" in user edit page to send the setup link manually.'
      });
    }

    console.log('[USER_CREATE] Password setup link generated:', { ...logContext, userId: authData.user.id });

    // Get company name for the welcome email
    const { data: companyData, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('company_name')
      .eq('id', companyId)
      .single();

    if (companyError) {
      console.warn('[USER_CREATE] Could not fetch company name:', { ...logContext, companyId, error: companyError.message });
    }

    // Send welcome email via Microsoft Graph API (not Supabase email)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const emailTemplate = welcomeEmailTemplate({
      userName: name,
      userEmail: email,
      companyName: companyData?.company_name || 'Your Company',
      setupLink: setupData.properties.action_link, // The password setup link from Supabase
      siteUrl: siteUrl
    });

    const emailResult = await sendMail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html
    });

    if (!emailResult.success) {
      console.error('[USER_CREATE] Failed to send welcome email:', { ...logContext, userId: authData.user.id, email, error: emailResult.error });
      return NextResponse.json({
        success: true,
        userId: authData.user.id,
        warning: 'User created but failed to send welcome email. Please resend manually.'
      });
    }

    const duration = Date.now() - startTime;
    console.log('[USER_CREATE] SUCCESS - User created and email sent:', { 
      ...logContext, 
      userId: authData.user.id, 
      email, 
      companyId,
      durationMs: duration,
      messageId: emailResult.messageId 
    });

    return NextResponse.json({
      success: true,
      userId: authData.user.id,
      message: 'User created successfully and setup email sent'
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[USER_CREATE] ERROR - User creation failed:', { 
      ...logContext, 
      error: error.message, 
      stack: error.stack,
      durationMs: duration 
    });
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}

