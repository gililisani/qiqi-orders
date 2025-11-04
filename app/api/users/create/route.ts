import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendMail } from '../../../../lib/emailService';
import { welcomeEmailTemplate } from '../../../../lib/emailTemplates';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { name, email, companyId, enabled } = await request.json();

    // Validate input
    if (!name || !email || !companyId) {
      return NextResponse.json(
        { error: 'Missing required fields: name, email, and companyId' },
        { status: 400 }
      );
    }

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
      if (authError.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'A user with this email already exists. Please use a different email.' },
          { status: 400 }
        );
      }
      throw authError;
    }

    if (!authData.user) {
      throw new Error('Failed to create user account');
    }

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
      // If profile creation fails, clean up the auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    // Generate password setup link using Supabase admin API
    // Note: Password reset link expiration is controlled by Supabase's JWT expiry setting
    // Default is 1 hour (3600 seconds). To set 24 hours (86400 seconds):
    // - Check Authentication → Advanced settings in Supabase Dashboard
    // - Or contact Supabase support if setting is not visible (may require paid plan)
    // - The generateLink API does not support custom expiration time
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/confirm-password-reset`
      }
    });

    if (resetError) {
      console.error('Failed to generate setup link:', resetError);
      return NextResponse.json({
        success: true,
        userId: authData.user.id,
        warning: 'User created but failed to generate setup link. Please use Reset Password to send the link manually.'
      });
    }

    // Get company name for the welcome email
    const { data: companyData } = await supabaseAdmin
      .from('companies')
      .select('company_name')
      .eq('id', companyId)
      .single();

    // Send welcome email via Microsoft Graph API (not Supabase email)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const emailTemplate = welcomeEmailTemplate({
      userName: name,
      userEmail: email,
      companyName: companyData?.company_name || 'Your Company',
      setupLink: resetData.properties.action_link, // The magic link from Supabase
      siteUrl: siteUrl
    });

    const emailResult = await sendMail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html
    });

    if (!emailResult.success) {
      console.error('Failed to send welcome email:', emailResult.error);
      return NextResponse.json({
        success: true,
        userId: authData.user.id,
        warning: 'User created but failed to send welcome email. Please resend manually.'
      });
    }

    console.log('Welcome email sent successfully to:', email);

    return NextResponse.json({
      success: true,
      userId: authData.user.id,
      message: 'User created successfully and setup email sent'
    });

  } catch (error: any) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}

