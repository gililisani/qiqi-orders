/**
 * Email Authentication - OAuth Token Management for Microsoft 365 SMTP
 * 
 * This module handles OAuth token acquisition and caching for sending emails
 * via Microsoft 365 SMTP using client credentials flow.
 */

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface CachedToken {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

let tokenCache: CachedToken | null = null;

/**
 * Get an OAuth access token for SMTP authentication
 * Implements token caching and refresh logic
 */
export async function getSmtpAccessToken(): Promise<string> {
  // Check if we have a valid cached token (with 60 second buffer)
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60000) {
    return tokenCache.token;
  }

  // Token expired or doesn't exist - fetch a new one
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;

  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
    throw new Error(
      'Missing Azure OAuth credentials. Please set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET environment variables.'
    );
  }

  const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: 'https://outlook.office365.com/.default',
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorSnippet = errorText.substring(0, 200); // Don't log full response (may contain sensitive info)
      throw new Error(
        `Failed to obtain OAuth token. HTTP ${response.status}: ${errorSnippet}`
      );
    }

    const data: TokenResponse = await response.json();

    // Cache the token (expires_in is in seconds)
    tokenCache = {
      token: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };

    // Debug: Decode token to verify claims (don't log in production)
    try {
      const payload = JSON.parse(Buffer.from(data.access_token.split('.')[1], 'base64').toString());
      console.log('Token Claims:', {
        aud: payload.aud,
        roles: payload.roles,
        app_displayname: payload.app_displayname,
        expires: new Date(payload.exp * 1000).toISOString(),
      });
    } catch (e) {
      console.log('Could not decode token for debugging');
    }

    return data.access_token;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`OAuth token request failed: ${error.message}`);
    }
    throw error;
  }
}
