import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // Send password reset email so user can set their own password
    const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/confirm-password-reset`
      }
    );

    if (resetError) {
      console.error('Failed to send password reset email:', resetError);
      return NextResponse.json({
        success: true,
        userId: authData.user.id,
        warning: 'User created but failed to send setup email. Admin can resend via Reset Password.'
      });
    }

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

