import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAuth, type AuthUser } from './index';
import { isTotpStale } from '../../lib/mfa';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function createServiceRoleClient(): SupabaseClient {
  // NOTE: no global `Prefer: return=minimal` header. supabase-js already
  // defaults writes to minimal; forcing it globally conflicts with the
  // `return=representation` that `.insert(...).select()` adds, and PostgREST
  // can honor the wrong one — null payloads from successful inserts.
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireAuthenticatedUser(request: NextRequest): Promise<AuthUser> {
  const auth = createAuth();
  const user = await auth.getUserFromRequest(request);
  if (!user) {
    throw NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await enforceAdminMfa(user);
  return user;
}

/**
 * MFA Phase 2 (2026-08): an ADMIN with a verified factor must be on an
 * aal2 session whose last code entry is younger than MFA_MAX_AGE_DAYS.
 * Sits in requireAuthenticatedUser so every guard path — including mixed
 * admin/client routes — inherits it. Admins without a factor pass (the
 * mfa_required hold pushes them to enroll); clients are untouched.
 */
async function enforceAdminMfa(user: AuthUser): Promise<void> {
  if (!user.roles.includes('admin')) return;

  const mfaRequired = () =>
    NextResponse.json(
      { error: 'Two-factor verification required.', code: 'mfa_required' },
      { status: 401 },
    );

  if (user.aal === 'aal2') {
    // Enforce the 30-day MFA life server-side too — the client gate prompts,
    // but a stolen long-lived session talking straight to the API must not
    // outlive it.
    if (isTotpStale(user.amr)) {
      throw mfaRequired();
    }
    return;
  }

  // aal1 admin: blocked iff enrolled. The lookup is service-role-only SQL
  // (user_has_verified_mfa, migration 20260803210000). Steady-state this
  // path is cold — enrolled admins run aal2 sessions.
  const { data, error } = await createServiceRoleClient().rpc('user_has_verified_mfa', {
    target: user.id,
  });
  if (error) {
    // Migration not applied yet → fail open, loudly. The SQL ships first by
    // our deploy routine; this guard just prevents a bricked portal if the
    // order ever slips.
    console.error('[enforceAdminMfa] user_has_verified_mfa failed (migration missing?):', error.message);
    return;
  }
  if (data === true) {
    throw mfaRequired();
  }
}

export async function requireAnyRole(request: NextRequest, roles: Array<'admin' | 'client'>): Promise<AuthUser> {
  const user = await requireAuthenticatedUser(request);
  const ok = roles.some((r) => user.roles.includes(r));
  if (!ok) {
    throw NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }
  return user;
}

export async function requireAdmin(request: NextRequest): Promise<AuthUser> {
  return requireAnyRole(request, ['admin']);
}

export async function requireClient(request: NextRequest): Promise<AuthUser> {
  return requireAnyRole(request, ['client']);
}

/**
 * Load a user's permission set from whichever table they belong to. Returns
 * an empty array if the user is disabled or not found. Used by the
 * permission-aware route guard below and by any API route that needs to
 * branch on what the caller is allowed to do.
 */
async function fetchUserPermissions(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  // Admins win if both rows exist (shouldn't happen in production but
  // matches the auth_has_permission() SQL helper's OR semantics).
  const { data: adminRow } = await supabase
    .from('admins')
    .select('permissions, enabled')
    .eq('id', userId)
    .maybeSingle();
  if (adminRow?.enabled && Array.isArray(adminRow.permissions)) {
    return adminRow.permissions;
  }

  const { data: clientRow } = await supabase
    .from('clients')
    .select('permissions, enabled')
    .eq('id', userId)
    .maybeSingle();
  if (clientRow?.enabled && Array.isArray(clientRow.permissions)) {
    return clientRow.permissions;
  }

  return [];
}

/**
 * Require the caller to be authenticated AND hold the named permission.
 *
 * Wraps requireAnyRole(['admin','client']) — the broadest auth gate — then
 * looks up the caller's permissions array and verifies the requested
 * permission is in it. Returns the AuthUser (with .permissions attached)
 * if authorized; throws a 403 NextResponse otherwise.
 *
 * Honors SUPER_ADMIN_IDS env var (comma-separated user IDs that bypass
 * every permission check). Use sparingly — typically just the owner's id.
 */
/**
 * Require an ADMIN who also holds the named permission. Use this for
 * admin-only route families (netsuite, reports, user management) —
 * requireWithPermission alone would admit a client granted the same
 * permission string (clients legitimately hold 'reports' for their own
 * portal pages, which must not open admin APIs).
 */
export async function requireAdminWithPermission(
  request: NextRequest,
  permission: string,
): Promise<AuthUser & { permissions: string[] }> {
  const user = await requireAdmin(request);

  const superIds = (process.env.SUPER_ADMIN_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (superIds.includes(user.id)) {
    return { ...user, permissions: ['*'] };
  }

  const supabase = createServiceRoleClient();
  const permissions = await fetchUserPermissions(supabase, user.id);
  if (!permissions.includes(permission)) {
    throw NextResponse.json(
      {
        error: 'Not authorized for this area.',
        missingPermission: permission,
      },
      { status: 403 },
    );
  }
  return { ...user, permissions };
}

export async function requireWithPermission(
  request: NextRequest,
  permission: string,
): Promise<AuthUser & { permissions: string[] }> {
  const user = await requireAnyRole(request, ['admin', 'client']);

  // Super-admin override.
  const superIds = (process.env.SUPER_ADMIN_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (superIds.includes(user.id)) {
    return { ...user, permissions: ['*'] };
  }

  const supabase = createServiceRoleClient();
  const permissions = await fetchUserPermissions(supabase, user.id);

  if (!permissions.includes(permission)) {
    throw NextResponse.json(
      {
        error: 'Not authorized for this area.',
        missingPermission: permission,
      },
      { status: 403 },
    );
  }

  return { ...user, permissions };
}

