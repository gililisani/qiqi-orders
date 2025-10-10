/**
 * Email Service - Send emails via Microsoft 365 SMTP with OAuth
 * 
 * This module provides a secure email sending service using OAuth authentication.
 * All emails are sent from orders@qiqiglobal.com (locked sender).
 */

import nodemailer from 'nodemailer';
import { getSmtpAccessToken } from './emailAuth';

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const LOCKED_SENDER_EMAIL = 'orders@qiqiglobal.com';
const LOCKED_SENDER_NAME = 'Qiqi Orders';

/**
 * Send an email via Microsoft 365 SMTP using OAuth authentication
 * 
 * @param options - Email options (to, subject, text, html)
 * @returns Email result with success status and message ID or error
 */
export async function sendMail(options: EmailOptions): Promise<EmailResult> {
  const { to, subject, text, html } = options;

  // Validate required environment variables
  const { SMTP_HOST, SMTP_PORT, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_FROM) {
    return {
      success: false,
      error: 'Missing SMTP configuration. Please set SMTP_HOST, SMTP_PORT, and SMTP_FROM environment variables.',
    };
  }

  // Ensure sender is locked to orders@qiqiglobal.com
  if (SMTP_FROM !== LOCKED_SENDER_EMAIL) {
    return {
      success: false,
      error: `Sender must be ${LOCKED_SENDER_EMAIL}. Current SMTP_FROM: ${SMTP_FROM}`,
    };
  }

  try {
    // Get OAuth access token (from client-credentials flow)
    const accessToken = await getSmtpAccessToken();

    // Create transporter with OAuth2 (client-credentials, no refresh token)
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10),
      secure: false, // Use STARTTLS (not SSL)
      auth: {
        type: 'OAuth2',
        user: LOCKED_SENDER_EMAIL, // Act as the shared mailbox orders@qiqiglobal.com
        accessToken: accessToken,
        // DO NOT pass clientId, clientSecret, or refreshToken
        // We're using a pre-fetched accessToken from client-credentials flow
      },
      logger: true, // Enable logging to see SMTP capability negotiation
      debug: true,  // Enable debug mode (tokens will be filtered)
    });

    // Send email
    const info = await transporter.sendMail({
      from: `"${LOCKED_SENDER_NAME}" <${LOCKED_SENDER_EMAIL}>`,
      to,
      subject,
      text,
      html,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: any) {
    // Log full error for debugging (but don't log tokens)
    console.error('SMTP Error Details:', {
      message: error?.message,
      code: error?.code,
      command: error?.command,
      response: error?.response,
      responseCode: error?.responseCode,
    });

    // Parse common SMTP errors and provide helpful hints
    const errorMessage = error?.message || String(error);
    const fullError = `${errorMessage}\n\nSMTP Response: ${error?.response || 'N/A'}`;

    if (errorMessage.includes('535 5.7.3')) {
      return {
        success: false,
        error: `SMTP Authentication Failed (535 5.7.3). 
        
Full Error: ${fullError}

Troubleshooting:
1. Verify Application permission 'SMTP.SendAsApp' has admin consent in Azure
2. Ensure 'Authenticated SMTP' is enabled in Microsoft 365 Admin Center (org-level)
3. Run: Get-CASMailbox "orders@qiqiglobal.com" | fl SmtpClientAuthenticationDisabled
   Should be: False (enabled)
4. If disabled, run: Set-CASMailbox -Identity "orders@qiqiglobal.com" -SmtpClientAuthenticationDisabled $false
5. Verify token aud claim is https://outlook.office365.com
6. Confirm AUTH XOAUTH2 is being used (check debug logs above)`,
      };
    }

    if (errorMessage.includes('550 5.7.60')) {
      return {
        success: false,
        error: `Sender Not Authorized (550 5.7.60). 
        
Full Error: ${fullError}

Troubleshooting:
1. Ensure both auth.user and from are exactly '${LOCKED_SENDER_EMAIL}'
2. Current auth.user: ${LOCKED_SENDER_EMAIL}
3. Current SMTP_FROM: ${SMTP_FROM}
4. Verify you're not trying to send as a different mailbox`,
      };
    }

    // Generic error with full SMTP response
    return {
      success: false,
      error: `Failed to send email: ${fullError}`,
    };
  }
}
