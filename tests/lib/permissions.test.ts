import { describe, it, expect } from 'vitest';
import {
  ADMIN_PERMISSION_GROUPS,
  ADMIN_PERMISSIONS,
  ALL_PERMISSIONS,
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_CLIENT_PERMISSIONS,
  firstAllowedAdminArea,
} from '@/lib/permissions';

describe('admin permission catalog (2026-09 category model)', () => {
  it('has the 10 owner-specified categories', () => {
    expect(ADMIN_PERMISSION_GROUPS.map((g) => g.category)).toEqual([
      'Dashboard', 'Orders', 'Catalog', 'Assets', 'Insights',
      'Amazon', 'Shopify', 'Configurations', 'Distributors', 'Users',
    ]);
  });

  it('every group is either enable-only or a view/edit pair', () => {
    for (const g of ADMIN_PERMISSION_GROUPS) {
      if (g.single) {
        expect(g.view).toBeUndefined();
        expect(g.edit).toBeUndefined();
      } else {
        expect(g.view).toMatch(/:view$/);
        expect(g.edit).toMatch(/:edit$/);
        expect(g.view!.split(':')[0]).toBe(g.edit!.split(':')[0]);
      }
    }
  });

  it('client vocabulary stays intact (RLS depends on it)', () => {
    expect(ALL_PERMISSIONS).toContain('orders');
    expect(ALL_PERMISSIONS).toContain('dam');
    expect(ALL_PERMISSIONS).toContain('reports');
    expect(DEFAULT_CLIENT_PERMISSIONS).toEqual(['orders', 'dam']);
  });

  it('new admins get every admin key', () => {
    expect(DEFAULT_ADMIN_PERMISSIONS).toEqual(ADMIN_PERMISSIONS);
    expect(DEFAULT_ADMIN_PERMISSIONS).toContain('dashboard');
    expect(DEFAULT_ADMIN_PERMISSIONS).toContain('orders:edit');
    expect(DEFAULT_ADMIN_PERMISSIONS).toContain('users:edit');
  });

  it('lands admins on the first area they can see', () => {
    expect(firstAllowedAdminArea(['dashboard', 'orders:view'])).toBe('/admin');
    expect(firstAllowedAdminArea(['orders:view'])).toBe('/admin/orders');
    expect(firstAllowedAdminArea(['insights'])).toBe('/admin/reports');
    expect(firstAllowedAdminArea(['shopify:view'])).toBe('/admin/shopify');
    expect(firstAllowedAdminArea([])).toBeNull();
  });
});
