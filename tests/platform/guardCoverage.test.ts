/**
 * Guard coverage — every API route must authenticate, deliberately.
 *
 * The audit found requireWithPermission called by 1 of 95 routes; WP3/WP4
 * fixed that, and this test keeps it fixed: a new route ships either with a
 * standard guard, the auth adapter, or an EXPLICIT allowlist entry saying
 * why it doesn't need one. Silent unauthenticated routes fail CI.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_ROOT = join(__dirname, '..', '..', 'app', 'api');

/** Routes that legitimately have no user-session guard. Every entry needs
 *  a reason — additions to this list are a code-review decision. */
const ALLOWLIST: Record<string, string> = {
  'auth/check-user': 'public login step 1 (rate-limited, returns role only)',
  'auth/request-login-code': 'public login code request (rate-limited)',
  'auth/verify-login-code': 'public login code verify (rate-limited)',
  'auth/reset-password': 'public password reset request (rate-limited)',
  'auth/set-password': 'token-authenticated (hashed setup token, rate-limited)',
  'cron/refresh-reports': 'cron secret auth',
  'cron/amazon-fba-monthly': 'cron secret auth',
  'cron/refresh-invoices': 'cron secret auth',
  'cron/shopify-poll': 'cron secret auth',
  'cron/shopify-reconcile': 'cron secret auth',
  'cron/shopify-payouts': 'cron secret auth',
  'cron/finance-reports': 'cron secret auth',
  'cron/shopify-watchdog': 'cron secret auth',
  'cron/fulfillment-poll': 'cron secret auth',
  'stripe/webhook': 'Stripe signature verification',
  'fulfillment/shiphero/webhook': 'HMAC signature verification (fails closed)',
};

/** A file counts as guarded when it uses the guards module or the auth
 *  adapter's role check. */
const GUARD_PATTERNS = [
  /requireAdminWithPermission\s*\(/,
  /requireWithPermission\s*\(/,
  /requireAuthenticatedUser\s*\(/,
  /requireAnyRole\s*\(/,
  /requireAdmin\s*\(/,
  /requireClient\s*\(/,
  /\.requireRole\s*\(/,
  /\.getUserFromRequest\s*\(/,
];

function collectRoutes(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectRoutes(full, out);
    else if (entry === 'route.ts' || entry === 'route.tsx') out.push(full);
  }
  return out;
}

describe('API guard coverage', () => {
  const routes = collectRoutes(API_ROOT);

  it('finds a realistic number of routes (sanity)', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it('every route is guarded or explicitly allowlisted', () => {
    const unguarded: string[] = [];

    for (const file of routes) {
      const rel = file
        .slice(join(API_ROOT, '/').length)
        .replace(/\/route\.tsx?$/, '')
        .replace(/\\/g, '/');
      if (rel in ALLOWLIST) continue;

      const src = readFileSync(file, 'utf8');
      if (!GUARD_PATTERNS.some((p) => p.test(src))) {
        unguarded.push(rel);
      }
    }

    expect(
      unguarded,
      `Unguarded API routes (add a guard, or an ALLOWLIST entry with a reason):\n  ${unguarded.join('\n  ')}`
    ).toEqual([]);
  });

  it('allowlist entries still exist (no stale exemptions)', () => {
    const rels = new Set(
      routes.map((f) =>
        f.slice(join(API_ROOT, '/').length).replace(/\/route\.tsx?$/, '').replace(/\\/g, '/')
      )
    );
    const stale = Object.keys(ALLOWLIST).filter((k) => !rels.has(k));
    expect(stale, `Stale allowlist entries: ${stale.join(', ')}`).toEqual([]);
  });
});
