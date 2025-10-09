/**
 * Email Service for SMTP (Microsoft 365)
 * 
 * Sends emails via smtp.office365.com using OAuth2 authentication
 * All emails are sent as orders@qiqiglobal.com (shared mailbox)
 */

import nodemailer from 'nodemailer';
import { getSmtpAccessToken } from './emailAuth';

// Locked sender configuration
const SMTP_FROM_EMAIL = 'orders@qiqiglobal.com';
const SMTP_FROM_NAME = 'Qiqi Orders';
const SMTP_HOST = 'smtp.office365.com';
const SMTP_PORT = 587;

interface SendMailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

interface SendMailResult {
  success: boolean;
  messageId: string;
}

/**
 * Send email via SMTP using OAuth2
 * 
 * - Always sends from orders@qiqiglobal.com (sender is locked)
 * - Uses STARTTLS on port 587
 * - OAuth2 authentication with auto-refreshing tokens
 * 
 * @param options Email options (to, subject, text, html)
 * @returns Success object with message ID
 * @throws Error with helpful hints for common SMTP failures
 */
export async function sendMail(options: SendMailOptions): Promise<SendMailResult> {
  const { to, subject, text, html } = options;

  // Validate required fields
  if (!to || !subject) {
    throw new Error('Email requires "to" and "subject" fields');
  }

  if (!text && !html) {
    throw new Error('Email requires either "text" or "html" content');
  }

  // Get fresh access token
  let accessToken: string;
  try {
    accessToken = await getSmtpAccessToken();
  } catch (error: any) {
    throw new Error(`Failed to get access token for SMTP: ${error.message}`);
  }

  // Create transporter with OAuth2
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // Use STARTTLS
    auth: {
      type: 'OAuth2',
      user: SMTP_FROM_EMAIL, // The mailbox we're acting as
      accessToken: accessToken,
    },
    tls: {
      ciphers: 'SSLv3',
    },
  });

  // Prepare message
  const message = {
    from: `"${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(message);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: any) {
    // Parse and provide helpful error messages
    const errorMessage = error.message || '';
    const errorCode = error.code || '';

    // Common error: Authentication unsuccessful
    if (errorMessage.includes('535 5.7.3') || errorMessage.includes('Authentication unsuccessful')) {
      throw new Error(
        'SMTP Authentication failed (535 5.7.3). ' +
        'Please verify: 1) Application permission "SMTP.SendAsApp" has admin consent in Azure AD, ' +
        '2) Authenticated SMTP is enabled in your Microsoft 365 organization, ' +
        '3) The orders@qiqiglobal.com mailbox allows authenticated SMTP.'
      );
    }

    // Common error: Not authorized to send as this sender
    if (errorMessage.includes('550 5.7.60') || errorMessage.includes('not authorized to send')) {
      throw new Error(
        'Not authorized to send as this sender (550 5.7.60). ' +
        'Ensure both auth.user and from are exactly "orders@qiqiglobal.com". ' +
        'We can only send as the shared mailbox, not other addresses.'
      );
    }

    // Connection/timeout errors
    if (errorCode === 'ETIMEDOUT' || errorCode === 'ECONNREFUSED') {
      throw new Error(
        `SMTP connection failed (${errorCode}). ` +
        'Please verify network connectivity and that smtp.office365.com:587 is accessible.'
      );
    }

    // Generic SMTP error
    throw new Error(`Failed to send email: ${errorMessage}`);
  }
}

/**
 * Verify SMTP configuration by sending a test email
 * 
 * @param testRecipient Email address to send test to
 * @returns Success object with message ID
 */
export async function sendTestEmail(testRecipient: string): Promise<SendMailResult> {
  return sendMail({
    to: testRecipient,
    subject: '✅ QIQI Orders - SMTP Test Email',
    text: 'This is a test email from the QIQI Orders system.\n\nIf you receive this, your SMTP configuration is working correctly!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">✅ SMTP Test Email</h2>
        <p>This is a test email from the <strong>QIQI Orders</strong> system.</p>
        <p>If you receive this, your SMTP configuration is working correctly!</p>
        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;">
        <p style="color: #6b7280; font-size: 12px;">
          Sent from: ${SMTP_FROM_EMAIL}<br>
          SMTP Host: ${SMTP_HOST}<br>
          Port: ${SMTP_PORT} (STARTTLS)
        </p>
      </div>
    `,
  });
}

