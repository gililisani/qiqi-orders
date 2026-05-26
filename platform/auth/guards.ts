import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAuth, type AuthUser } from './index';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function createServiceRoleClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Prefer: 'return=minimal',
      },
    },
  });
}

export async function requireAuthenticatedUser(request: NextRequest): Promise<AuthUser> {
  const auth = createAuth();
  const user = await auth.getUserFromRequest(request);
  if (!user) {
    throw NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return user;
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

