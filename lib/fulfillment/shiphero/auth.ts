import type { ShipHeroConfig } from './config';

/**
 * ShipHero access-token management.
 *
 * Auth model: a long-lived **refresh token** mints short-lived **access tokens**
 * (~28d JWTs) via `POST https://public-api.shiphero.com/auth/refresh`. We cache
 * the current access token in module memory and refresh it lazily when it's
 * missing or close to expiry. In a serverless runtime the cache is per-instance,
 * which is fine — refreshing is cheap and tokens last weeks.
 */

const AUTH_REFRESH_URL = 'https://public-api.shiphero.com/auth/refresh';

// Refresh when fewer than this many ms remain on the token, so an in-flight
// request never races the expiry boundary.
const EXPIRY_BUFFER_MS = 60 * 60 * 1000; // 1 hour

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

let cache: CachedToken | null = null;

/** Decode a JWT's `exp` (seconds since epoch) without verifying the signature. */
function readJwtExpiryMs(jwt: string): number | null {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function isFresh(t: CachedToken | null): t is CachedToken {
  return !!t && t.expiresAtMs - EXPIRY_BUFFER_MS > Date.now();
}

/** Exchange the refresh token for a new access token. */
async function refreshAccessToken(config: ShipHeroConfig): Promise<CachedToken> {
  const res = await fetch(AUTH_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refresh_token: config.refreshToken }),
  });

  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };

  if (!res.ok || !data.access_token) {
    throw new Error(`ShipHero token refresh failed (HTTP ${res.status}): ${data.error || 'no access_token returned'}`);
  }

  // Prefer the JWT's own exp; fall back to expires_in; last resort 24h.
  const expiresAtMs =
    readJwtExpiryMs(data.access_token) ??
    (data.expires_in ? Date.now() + data.expires_in * 1000 : Date.now() + 24 * 60 * 60 * 1000);

  return { token: data.access_token, expiresAtMs };
}

/**
 * Return a valid access token, refreshing if needed. Seeds the cache from the
 * env access token on first use (so we don't refresh a perfectly good token).
 */
export async function getAccessToken(config: ShipHeroConfig): Promise<string> {
  if (isFresh(cache)) return cache.token;

  // Seed from the env access token if it's still comfortably valid.
  if (config.accessToken) {
    const expiresAtMs = readJwtExpiryMs(config.accessToken);
    const seeded: CachedToken = { token: config.accessToken, expiresAtMs: expiresAtMs ?? 0 };
    if (isFresh(seeded)) {
      cache = seeded;
      return cache.token;
    }
  }

  cache = await refreshAccessToken(config);
  return cache.token;
}

/** Test seam: clear the in-memory token cache. */
export function __resetTokenCache(): void {
  cache = null;
}
