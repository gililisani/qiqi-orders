// lib/permissions.ts
export const PERMISSIONS = {
  ADMIN: [
    'products:read',
    'products:write',
    'products:delete',
    'companies:read',
    'companies:write',
    'companies:delete',
    'orders:read',
    'orders:write',
    'orders:delete',
    'users:read',
    'users:write',
    'users:delete',
    'locations:read',
    'locations:write',
    'locations:delete',
    'reports:read'
  ],
  CLIENT: [
    'products:read',
    'orders:read',
    'orders:write',
    'profile:read',
    'profile:write'
  ]
} as const;

export type Permission = typeof PERMISSIONS.ADMIN[number] | typeof PERMISSIONS.CLIENT[number];

export function hasPermission(userRole: 'Admin' | 'Client', permission: Permission): boolean {
  return PERMISSIONS[userRole].includes(permission as any);
}

export function getRolePermissions(userRole: 'Admin' | 'Client'): readonly Permission[] {
  return PERMISSIONS[userRole];
}
