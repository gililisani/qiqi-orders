/**
 * User permissions — canonical vocabulary + helpers.
 *
 * ADMIN model (restructured 2026-09-01, owner spec): permissions follow the
 * left-menu categories, each with View and Edit — `<category>:view` /
 * `<category>:edit` — except two enable-only areas (`dashboard`, `insights`).
 * View = open the pages / read the data; Edit = create, change, push, delete.
 * Where an area has no API surface (browser-direct Supabase under RLS), the
 * View/Edit split is enforced at the UI layer only — same posture the old
 * `settings` key had.
 *
 * CLIENT model unchanged: the flat `orders` / `dam` / `reports` strings.
 * They're referenced by RLS policies (auth_has_permission) — renaming them
 * would be a DB migration for zero benefit.
 *
 * The DB stores `permissions TEXT[]` on both admins and clients. The DB
 * doesn't constrain the values — the catalog below is the single source of
 * truth. Migration 20260901180000 remaps the legacy admin keys.
 *
 * Roles (named bundles of permissions) are deliberately NOT modeled yet.
 */

export interface AdminPermissionGroup {
  /** Sidebar category name (display). */
  category: string;
  description: string;
  /** Enable-only areas have `single`; the rest have view+edit. */
  single?: string;
  view?: string;
  edit?: string;
}

export const ADMIN_PERMISSION_GROUPS: readonly AdminPermissionGroup[] = [
  { category: 'Dashboard', single: 'dashboard', description: 'The admin home dashboard' },
  { category: 'Orders', view: 'orders:view', edit: 'orders:edit', description: 'Orders, acceptance, NetSuite/warehouse actions, SLI documents' },
  { category: 'Catalog', view: 'catalog:view', edit: 'catalog:edit', description: 'Products, categories, price list, compliance docs' },
  { category: 'Assets', view: 'assets:view', edit: 'assets:edit', description: 'Media library, campaigns, asset settings, announcements' },
  { category: 'Insights', single: 'insights', description: 'Reports and dashboards (read-only area)' },
  { category: 'Amazon', view: 'amazon:view', edit: 'amazon:edit', description: 'FBA financials and Amazon insights' },
  { category: 'Shopify', view: 'shopify:view', edit: 'shopify:edit', description: 'Shopify sync dashboard and actions' },
  { category: 'Configurations', view: 'config:view', edit: 'config:edit', description: 'NetSuite data/integration, inventory sync, SLI settings, lookup tables' },
  { category: 'Distributors', view: 'distributors:view', edit: 'distributors:edit', description: 'Partner companies — onboarding, contracts, historical sales' },
  { category: 'Users', view: 'users:view', edit: 'users:edit', description: 'Client users AND admin accounts' },
] as const;

/** Flat list of every admin permission key. */
export const ADMIN_PERMISSIONS: string[] = ADMIN_PERMISSION_GROUPS.flatMap((g) =>
  g.single ? [g.single] : [g.view!, g.edit!],
);

/** Client permission strings — unchanged legacy vocabulary (used in RLS). */
export const CLIENT_PERMISSIONS = {
  orders: 'Orders — view + create + edit',
  dam: 'DAM library — view + use',
  reports: 'Reports — view',
} as const;

export type Permission = string;

/** Every valid permission string (admin + client vocabularies). */
export const ALL_PERMISSIONS: string[] = [
  ...ADMIN_PERMISSIONS,
  ...Object.keys(CLIENT_PERMISSIONS),
];

/** Default permission set for a brand-new client. Matches today's behavior
 *  (a fresh client can both shop and browse DAM). */
export const DEFAULT_CLIENT_PERMISSIONS: string[] = ['orders', 'dam'];

/** Default permission set for a brand-new admin — full access. */
export const DEFAULT_ADMIN_PERMISSIONS: string[] = [...ADMIN_PERMISSIONS];

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
): '/client' | '/client/assets' | '/client/performance' | null {
  const perms = Array.isArray(permissions) ? permissions : [];
  // /client (the dashboard) is orders-centric, so 'orders' is the natural home.
  if (perms.includes('orders')) return '/client';
  // DAM library lives at /client/assets in this app.
  if (perms.includes('dam')) return '/client/assets';
  // Reports-only clients land on their performance page.
  if (perms.includes('reports')) return '/client/performance';
  return null;
}

/** Where should an ADMIN land after login? First category they can see,
 *  in sidebar order. */
export function firstAllowedAdminArea(
  permissions: string[] | null | undefined,
): string | null {
  const perms = Array.isArray(permissions) ? permissions : [];
  const has = (p: string) => perms.includes(p);
  if (has('dashboard')) return '/admin';
  if (has('orders:view')) return '/admin/orders';
  if (has('distributors:view')) return '/admin/companies';
  if (has('catalog:view')) return '/admin/products';
  if (has('assets:view')) return '/admin/dam';
  if (has('insights')) return '/admin/reports';
  if (has('amazon:view')) return '/admin/amazon';
  if (has('shopify:view')) return '/admin/shopify';
  if (has('config:view')) return '/admin/netsuite-data';
  if (has('users:view')) return '/admin/users';
  return null;
}
