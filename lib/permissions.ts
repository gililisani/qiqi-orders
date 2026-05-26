/**
 * User permissions — canonical vocabulary + helpers.
 *
 * Each permission is an atomic, area-scoped string. Code asks
 * `userHasPermission(user, 'dam')` — never `user.role === 'something'`.
 *
 * The DB stores `permissions TEXT[]` on both admins and clients. The DB
 * doesn't constrain the values — the catalog below is the single source
 * of truth for what's valid. Add a new permission by adding it here and
 * referencing it from the gate(s) that need it. No migration required.
 *
 * Roles (named bundles of permissions) are deliberately NOT modeled yet.
 * If user management ever gets unwieldy, layer a `roles` table on top:
 * each role bundles some of these permissions, users get assigned a role,
 * and the role's permissions populate user.permissions. The auth/RLS code
 * keeps asking the same question and doesn't change.
 *
 * NOTE: a previous experimental version of this file exposed
 * `PERMISSIONS.ADMIN` / `PERMISSIONS.CLIENT` arrays + a role-based
 * `hasPermission(role, perm)` function. That API had no callers and has
 * been replaced. If you find an import of the old API, update it to use
 * `userHasPermission(user, perm)` against this catalog instead.
 */

/** All permission strings, with human-readable labels for the admin UI. */
export const PERMISSIONS = {
  dam: 'DAM library — view + use',
  orders: 'Orders — view + create + edit',
  reports: 'Reports — view',
  'users:manage': 'Users — create / edit / disable client users',
  'admins:manage': 'Admins — create / edit / disable admin users',
  'companies:manage': 'Companies — onboard / edit',
  netsuite: 'NetSuite — push, sync, configure',
  settings: 'Settings — subsidiaries / locations / classes / etc.',
} as const;

export type Permission = keyof typeof PERMISSIONS;

/** Convenience: every permission in the catalog. Used when creating a new
 *  admin user and as the backfill target in the migration. */
export const ALL_PERMISSIONS: Permission[] = Object.keys(
  PERMISSIONS,
) as Permission[];

/** Default permission set for a brand-new client. Matches today's behavior
 *  (a fresh client can both shop and browse DAM). */
export const DEFAULT_CLIENT_PERMISSIONS: Permission[] = ['orders', 'dam'];

/** Default permission set for a brand-new admin — full access. */
export const DEFAULT_ADMIN_PERMISSIONS: Permission[] = [...ALL_PERMISSIONS];

/** Optional escape hatch: a comma-separated list of user IDs in
 *  SUPER_ADMIN_IDS env var bypasses every permission check. Use for the
 *  owner's account so a misconfigured permission grant never locks
 *  yourself out. Empty / unset by default. */
function superAdminIds(): Set<string> {
  const raw = process.env.SUPER_ADMIN_IDS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export interface PermissionedUser {
  id?: string | null;
  permissions?: string[] | null;
}

/** Does this user hold the named permission? Use this everywhere — never
 *  open-code `user.permissions.includes(...)` so the super-admin override
 *  and any future logic (roles, time-bound grants) stays centralized. */
export function userHasPermission(
  user: PermissionedUser | null | undefined,
  perm: Permission,
): boolean {
  if (!user) return false;
  if (user.id && superAdminIds().has(user.id)) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(perm);
}

/** Where should a CLIENT land after login? Pick the first area they're
 *  allowed to see. Returns null if the user has no client-side area
 *  access at all (caller should redirect to /forbidden). */
export function firstAllowedClientArea(
  permissions: string[] | null | undefined,
): '/client' | '/client/assets' | '/client/company' | null {
  const perms = Array.isArray(permissions) ? permissions : [];
  // /client (the dashboard) is orders-centric, so 'orders' is the natural home.
  if (perms.includes('orders')) return '/client';
  // DAM library lives at /client/assets in this app.
  if (perms.includes('dam')) return '/client/assets';
  // "Your company" surfaces company-level info gated on the reports permission.
  if (perms.includes('reports')) return '/client/company';
  return null;
}

/** Where should an ADMIN land after login? Same logic, broader area set. */
export function firstAllowedAdminArea(
  permissions: string[] | null | undefined,
): string | null {
  const perms = Array.isArray(permissions) ? permissions : [];
  // Order matches the sidebar's priority — orders is the daily-driver.
  if (perms.includes('orders')) return '/admin';
  if (perms.includes('dam')) return '/admin/dam';
  if (perms.includes('reports')) return '/admin/reports';
  if (perms.includes('companies:manage')) return '/admin/companies';
  if (perms.includes('users:manage')) return '/admin/users';
  return null;
}
