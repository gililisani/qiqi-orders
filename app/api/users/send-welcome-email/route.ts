/**
 * API Route: Send Welcome Email to New Users
 * 
 * POST /api/users/send-welcome-email
 * 
 * Sends a welcome email with temporary password to newly created users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendMail } from '../../../../lib/emailService';
import { welcomeUserTemplate } from '../../../../lib/emailTemplates';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userName, userEmail, temporaryPassword, companyName } = body;

    // Validate input
    if (!userName || !userEmail || !temporaryPassword || !companyName) {
      return NextResponse.json(
        { error: 'Missing required fields: userName, userEmail, temporaryPassword, companyName' },
        { status: 400 }
      );
    }

    // Get site URL
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    // Generate welcome email
    const emailTemplate = welcomeUserTemplate({
      userName,
      userEmail,
      temporaryPassword,
      companyName,
      siteUrl,
    });

    // Send email via Microsoft Graph API
    const result = await sendMail({
      to: userEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Welcome email sent successfully',
      messageId: result.messageId,
    });
  } catch (error: any) {
    console.error('Error sending welcome email:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send welcome email' },
      { status: 500 }
    );
  }
}

