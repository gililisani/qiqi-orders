/**
 * Email Service - Send emails via Microsoft Graph API
 * 
 * This module provides a secure email sending service using Microsoft Graph API.
 * All emails are sent from orders@qiqiglobal.com (locked sender).
 */

import { getGraphAccessToken } from './emailAuth';

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
 * Send an email via Microsoft Graph API using OAuth authentication
 * 
 * @param options - Email options (to, subject, text, html)
 * @param retryCount - Internal retry counter for exponential backoff
 * @returns Email result with success status and message ID or error
 */
export async function sendMail(options: EmailOptions, retryCount = 0): Promise<EmailResult> {
  const { to, subject, text, html } = options;

  try {
    // Get OAuth access token for Microsoft Graph
    const accessToken = await getGraphAccessToken();

    // Build the message body (Graph API format)
    const message = {
      message: {
        subject: subject,
        body: {
          contentType: html ? 'HTML' : 'Text',
          content: html || text || '',
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
      },
      saveToSentItems: true,
    };

    // Send email via Microsoft Graph API
    const graphUrl = `https://graph.microsoft.com/v1.0/users/${LOCKED_SENDER_EMAIL}/sendMail`;
    
    const response = await fetch(graphUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    // Handle rate limiting (429) and server errors (503) with retry
    if (response.status === 429 || response.status === 503) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
      const backoffDelay = Math.min(Math.pow(2, retryCount) * 1000, retryAfter * 1000);

      if (retryCount < 3) {
        console.log(`Rate limited or service unavailable (${response.status}). Retrying in ${backoffDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        return sendMail(options, retryCount + 1);
      } else {
        return {
          success: false,
          error: `Rate limit exceeded after ${retryCount} retries. Please try again later.`,
        };
      }
    }

    // Handle authentication errors
    if (response.status === 401) {
      return {
        success: false,
        error: `Authentication failed (401 Unauthorized).

Troubleshooting:
1. Verify Azure App Registration has the correct credentials (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)
2. Check that the access token is valid and not expired
3. Ensure the app has the required permissions`,
      };
    }

    // Handle permission errors
    if (response.status === 403) {
      return {
        success: false,
        error: `Permission denied (403 Forbidden).

Troubleshooting:
1. Check Graph API → Application permissions → Mail.Send
2. Ensure admin consent has been granted
3. Go to Azure Portal → App Registrations → Your App → API permissions
4. Click "Grant admin consent for [Your Organization]"`,
      };
    }

    // Handle mailbox not found errors
    if (response.status === 404) {
      return {
        success: false,
        error: `Mailbox not found (404 Not Found).

Troubleshooting:
1. Confirm the orders@qiqiglobal.com mailbox exists
2. Verify the mailbox is active and not disabled
3. Check the mailbox spelling is correct`,
      };
    }

    // Check if the request was successful
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to send email via Graph API. HTTP ${response.status}: ${errorText}`,
      };
    }

    // Success! Graph API returns 202 Accepted with no body for sendMail
    return {
      success: true,
      messageId: `sent-via-graph-${Date.now()}`,
    };
  } catch (error: any) {
    console.error('Graph API Error:', error.message);
    return {
      success: false,
      error: `Failed to send email: ${error.message}`,
    };
  }
}
