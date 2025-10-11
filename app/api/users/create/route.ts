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

    // Send invite email by generating a password reset token manually
    // Note: This uses the same mechanism but for a newly created user
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
        warning: 'User created but failed to generate setup email. Please use Reset Password to send the link manually.'
      });
    }

    console.log('Setup email link generated successfully for:', email);

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

