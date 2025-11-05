/**
 * API Route: Send Password Reset Link to User (Admin)
 * 
 * POST /api/users/send-reset-link
 * 
 * Admin can send a password reset link to any user.
 * This is useful when editing users or when a user needs a new setup link.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendMail } from '../../../../lib/emailService';
import { passwordResetEmailTemplate } from '../../../../lib/emailTemplates';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userEmail, userName } = body;

    // Validate input
    if (!userId || !userEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: userId and userEmail' },
        { status: 400 }
      );
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Generate password reset link using Supabase admin API
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: userEmail,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/confirm-password-reset`
      }
    });

    if (resetError) {
      console.error('Failed to generate reset link:', resetError);
      return NextResponse.json(
        { error: `Failed to generate password reset link: ${resetError.message}` },
        { status: 500 }
      );
    }

    // Get user name if not provided
    let displayName = userName || userEmail.split('@')[0];

    // Send password reset email via Microsoft Graph API
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const emailTemplate = passwordResetEmailTemplate({
      userName: displayName,
      userEmail: userEmail,
      resetLink: resetData.properties.action_link,
      siteUrl: siteUrl
    });

    const emailResult = await sendMail({
      to: userEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html
    });

    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
      return NextResponse.json(
        { error: `Failed to send email: ${emailResult.error}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset link sent successfully',
      messageId: emailResult.messageId,
    });
  } catch (error: any) {
    console.error('Error in send-reset-link API:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

