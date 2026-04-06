/**
 * API Route: Request Password Reset
 * 
 * POST /api/auth/reset-password
 * 
 * Generates a password reset link using Supabase admin API and sends it via custom email service
 * (not Supabase email service to avoid rate limits)
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendMail } from '../../../../lib/emailService';
import { passwordResetEmailTemplate } from '../../../../lib/emailTemplates';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import {
  RESET_PASSWORD_RATE,
  enforceRateLimit,
  getClientIp,
  normalizeEmailForRateLimit,
} from '../../../../platform/rateLimit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // Validate input
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase environment variables');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createServiceRoleClient();

    const normalizedEmail = normalizeEmailForRateLimit(email);
    const rateKey = `reset-password:ip:${getClientIp(request)}:email:${normalizedEmail}`;
    const limited = await enforceRateLimit(supabaseAdmin, {
      key: rateKey,
      limit: RESET_PASSWORD_RATE.limit,
      windowSeconds: RESET_PASSWORD_RATE.windowSeconds,
    });
    if (!limited.ok) return limited.response;

    // Check if user exists (to prevent email enumeration)
    const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error checking users:', listError);
      // Don't reveal if user exists or not for security
      return NextResponse.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    const userExists = authUsers.users.some(
      (user) => user.email?.toLowerCase() === normalizedEmail
    );
    
    if (!userExists) {
      // Don't reveal if user exists or not for security
      return NextResponse.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Generate password reset link using Supabase admin API
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/confirm-password-reset`
      }
    });

    if (resetError) {
      console.error('Failed to generate reset link:', resetError);
      return NextResponse.json(
        { error: 'Failed to generate password reset link. Please try again later.' },
        { status: 500 }
      );
    }

    // Get user name for the email (try to get from clients or admins table)
    let userName = normalizedEmail.split('@')[0]; // Fallback to email prefix
    
    try {
      const { data: clientData } = await supabaseAdmin
        .from('clients')
        .select('name')
        .eq('email', normalizedEmail)
        .single();
      
      if (clientData?.name) {
        userName = clientData.name;
      } else {
        const { data: adminData } = await supabaseAdmin
          .from('admins')
          .select('name')
          .eq('email', normalizedEmail)
          .single();
        
        if (adminData?.name) {
          userName = adminData.name;
        }
      }
    } catch (err) {
      // If we can't get the name, use the email prefix (already set)
      console.log('Could not fetch user name, using email prefix');
    }

    // Send password reset email via Microsoft Graph API (not Supabase email)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const emailTemplate = passwordResetEmailTemplate({
      userName: userName,
      userEmail: normalizedEmail,
      resetLink: resetData.properties.action_link, // The magic link from Supabase
      siteUrl: siteUrl
    });

    const emailResult = await sendMail({
      to: normalizedEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html
    });

    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
      return NextResponse.json(
        { error: 'Failed to send password reset email. Please try again later.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  } catch (error: any) {
    console.error('Error in reset password API:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

