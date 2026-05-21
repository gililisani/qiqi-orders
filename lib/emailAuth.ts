/**
 * Email Authentication - OAuth Token Management for Microsoft Graph API
 * 
 * This module handles OAuth token acquisition and caching for sending emails
 * via Microsoft Graph API using client credentials flow.
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
 * Get an OAuth access token for Microsoft Graph API
 * Implements token caching and refresh logic with 60-second buffer
 */
export async function getGraphAccessToken(): Promise<string> {
  // Check if we have a valid cached token (with 60 second buffer)
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60000) {
    return tokenCache.token;
  }

  // Token expired or doesn't exist - fetch a new one.
  // Trim env vars defensively — Vercel's UI sometimes captures trailing
  // whitespace/newlines when pasting, which produces a malformed URL and
  // a confusing "fetch failed" rather than a clear validation error.
  const tenantId = process.env.AZURE_TENANT_ID?.trim();
  const clientId = process.env.AZURE_CLIENT_ID?.trim();
  const clientSecret = process.env.AZURE_CLIENT_SECRET?.trim();

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Missing Azure OAuth credentials. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET env vars.'
    );
  }

  // Sanity-check the tenant id — GUIDs only (or "common" / "organizations"
  // which we don't use). If it has spaces or special chars we'll catch it now.
  if (!/^[a-zA-Z0-9.-]+$/.test(tenantId)) {
    throw new Error(
      `Malformed AZURE_TENANT_ID (contains unexpected characters). Check the Vercel env var for stray whitespace.`
    );
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
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
      const errorSnippet = errorText.substring(0, 200);
      throw new Error(`Failed to obtain OAuth token. HTTP ${response.status}: ${errorSnippet}`);
    }

    const data: TokenResponse = await response.json();

    tokenCache = {
      token: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };

    return data.access_token;
  } catch (error) {
    // Node fetch sets error.message = "fetch failed" and stashes the real
    // problem in error.cause (e.g. ENOTFOUND, ECONNREFUSED, certificate
    // errors). Surface both so the log is actually useful.
    if (error instanceof Error) {
      const cause = (error as any).cause;
      const causeMsg = cause
        ? cause instanceof Error
          ? `${cause.name}: ${cause.message}`
          : String(cause)
        : '';
      throw new Error(
        `OAuth token request failed: ${error.message}${causeMsg ? ` (cause: ${causeMsg})` : ''}`
      );
    }
    throw error;
  }
}
