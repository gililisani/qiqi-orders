/**
 * OAuth Token Management for SMTP (Microsoft 365)
 * 
 * Handles client-credentials OAuth flow to obtain access tokens
 * for sending emails via SMTP as orders@qiqiglobal.com
 */

interface TokenCache {
  accessToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

let cachedToken: TokenCache | null = null;

/**
 * Get SMTP access token using OAuth client-credentials flow
 * 
 * - Fetches token from Microsoft identity platform
 * - Caches token in memory until 60 seconds before expiry
 * - Automatically refreshes expired tokens
 * 
 * @returns Access token string
 * @throws Error if token request fails or environment variables are missing
 */
export async function getSmtpAccessToken(): Promise<string> {
  // Check if we have a valid cached token (with 60s buffer)
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    return cachedToken.accessToken;
  }

  // Validate required environment variables
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Missing required environment variables: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET'
    );
  }

  // Token endpoint
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  // Request body
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
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
      // Get error details without logging secrets
      const errorText = await response.text();
      const errorExcerpt = errorText.substring(0, 200); // First 200 chars only
      throw new Error(
        `OAuth token request failed (HTTP ${response.status}): ${errorExcerpt}`
      );
    }

    const data = await response.json();

    if (!data.access_token || !data.expires_in) {
      throw new Error('Invalid token response: missing access_token or expires_in');
    }

    // Cache the token with expiry time
    const expiresIn = parseInt(data.expires_in, 10) * 1000; // Convert to milliseconds
    cachedToken = {
      accessToken: data.access_token,
      expiresAt: now + expiresIn,
    };

    return cachedToken.accessToken;
  } catch (error: any) {
    // Clear cache on error
    cachedToken = null;

    if (error.message.includes('OAuth token request failed')) {
      throw error; // Already formatted
    }

    throw new Error(`Failed to obtain SMTP access token: ${error.message}`);
  }
}

/**
 * Clear the cached token (useful for testing or manual refresh)
 */
export function clearTokenCache(): void {
  cachedToken = null;
}

