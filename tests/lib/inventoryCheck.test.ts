import { describe, expect, it } from 'vitest';
import { buildCheckLines, lineDifference, lineStatus, summarize, type NsStock, type WmsStock } from '@/lib/inventoryCheck/compare';
import { runInventoryCheck } from '@/lib/inventoryCheck/run';
import { fetchShipHeroStock } from '@/lib/inventoryCheck/sources';

const ns = (sku: string, onHand: number, extra: Partial<NsStock> = {}): NsStock => ({
  sku, name: `NS ${sku}`, onHand, available: onHand, committed: 0, ...extra,
});
const wms = (sku: string, onHand: number, extra: Partial<WmsStock> = {}): WmsStock => ({
  sku, name: `SH ${sku}`, onHand, available: onHand, allocated: 0, nonSellable: 0, kit: false, ...extra,
});

describe('buildCheckLines', () => {
  const catalog = new Map([['FPS0018', 'Smooth Service Shampoo'], ['TOL0004', 'Flat Iron']]);

  it('pairs SKUs tolerant of case/spaces, names from the Hub catalog, products first', () => {
    const lines = buildCheckLines(
      [ns('FPS0018', 1952, { committed: 4 }), ns('COM0076', 5000), ns('TOL0004', 319)],
      [wms('fps0018 ', 1347, { allocated: 1076 }), wms('Sprayer', 2698), wms('TOL0004', 318)],
      catalog,
    );
    expect(lines.map((l) => [l.sku, l.name, lineStatus(l), lineDifference(l)])).toEqual([
      ['FPS0018', 'Smooth Service Shampoo', 'different', 605],
      ['TOL0004', 'Flat Iron', 'different', 1],
      ['COM0076', 'NS COM0076', 'ns_only', 5000],
      ['Sprayer', 'SH Sprayer', 'wms_only', -2698],
    ]);
    expect(lines[0]).toMatchObject({ in_catalog: true, ns_committed: 4, wms_allocated: 1076 });
  });

  it('sums warehouses, keeps non-sellable out of the difference, drops empty SKUs', () => {
    const lines = buildCheckLines(
      [ns('FPS0017', 193), ns('OLD1', 0)],
      [wms('FPS0017', 100, { nonSellable: 216 }), wms('FPS0017', 43), wms('GHOST', 0)],
      new Map(),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ sku: 'FPS0017', wms_on_hand: 143, wms_non_sellable: 216 });
    expect(lineDifference(lines[0])).toBe(50);
  });

  it('a SKU only spoken for (committed / allocated, nothing on hand) still shows', () => {
    const lines = buildCheckLines([ns('A', 0, { committed: 3 })], [wms('B', 0, { allocated: 5 })], new Map());
    expect(lines.map((l) => [l.sku, lineStatus(l)])).toEqual([
      ['A', 'ns_only'],
      ['B', 'wms_only'],
    ]);
  });

  it('summarize counts statuses and product units off', () => {
    const lines = buildCheckLines(
      [ns('FPS0018', 10), ns('TOL0004', 5), ns('X', 7)],
      [wms('FPS0018', 10), wms('TOL0004', 8), wms('X', 1)],
      catalog,
    );
    expect(summarize(lines)).toEqual({ skus: 3, matching: 1, different: 2, onlyOneSide: 0, productUnitsOff: 3 });
  });
});

describe('fetchShipHeroStock', () => {
  it('pages through warehouse products and lists the warehouses', async () => {
    const pages = [
      { edges: [{ node: { sku: 'A', warehouse_identifier: 'Primary', on_hand: 5, available: 4, allocated: 1, non_sellable_quantity: 0, product: { name: 'a', kit: false } } }], pageInfo: { hasNextPage: true, endCursor: 'c1' } },
      { edges: [{ node: { sku: 'B', warehouse_identifier: 'Primary', on_hand: 2, available: 2, allocated: 0, non_sellable_quantity: 1, product: { name: 'b', kit: true } } }], pageInfo: { hasNextPage: false, endCursor: null } },
    ];
    const seen: any[] = [];
    const client = {
      graphql: async (_q: string, vars: any) => {
        seen.push(vars);
        return { warehouse_products: { data: pages[seen.length - 1] } } as any;
      },
    };
    const r = await fetchShipHeroStock(client, '97016');
    expect(seen).toEqual([{ account: '97016', after: null }, { account: '97016', after: 'c1' }]);
    expect(r.warehouses).toEqual(['Primary']);
    expect(r.rows.map((x) => [x.sku, x.onHand, x.nonSellable, x.kit])).toEqual([
      ['A', 5, 0, false],
      ['B', 2, 1, true],
    ]);
  });
});

/** Just enough of the Supabase client for runInventoryCheck. */
function fakeDb(routes: any[], products: any[]) {
  const inserted: Record<string, any[]> = { inventory_checks: [], inventory_check_lines: [] };
  const deleted: Array<{ table: string; filter: string }> = [];
  let n = 0;
  const from = (table: string) => {
    const b: any = {
      _rows: table === 'fulfillment_routes' ? routes : table === 'Products' ? products : [],
      select: () => b,
      range: () => b,
      insert: (rows: any) => {
        const list = Array.isArray(rows) ? rows : [rows];
        const withIds = list.map((r) => (table === 'inventory_checks' ? { id: `check-${++n}`, ...r } : r));
        inserted[table].push(...withIds);
        b._rows = withIds;
        return b;
      },
      delete: () => ({
        eq: async (_c: string, v: string) => (deleted.push({ table, filter: `id=${v}` }), { error: null }),
        lt: async (_c: string, v: string) => (deleted.push({ table, filter: `before ${v}` }), { error: null }),
      }),
      single: async () => ({ data: b._rows[0], error: null }),
      then: (resolve: any) => Promise.resolve({ data: b._rows, error: null }).then(resolve),
    };
    return b;
  };
  return { db: { from } as any, inserted, deleted };
}

describe('runInventoryCheck', () => {
  const routes = [
    { location_id: 'L1', location: { id: 'L1', location_name: 'Brandfox Qiqi Global', netsuite_id: '46', active: true } },
    { location_id: 'L1', location: { id: 'L1', location_name: 'Brandfox Qiqi Global', netsuite_id: '46', active: true } },
  ];
  const now = new Date('2026-10-12T06:00:00Z');

  it('one check per ships-from location, with its lines; old checks pruned', async () => {
    const { db, inserted, deleted } = fakeDb(routes, [{ sku: 'FPS0018', item_name: 'Smooth Service Shampoo' }]);
    const nsCalls: string[] = [];
    const results = await runInventoryCheck(
      db,
      {
        fetchNetSuite: async (id) => (nsCalls.push(id), [ns('FPS0018', 10)]),
        fetchWarehouse: async () => ({ rows: [wms('FPS0018', 8)], warehouses: ['Primary'] }),
      },
      { trigger: 'nightly', now },
    );
    expect(nsCalls).toEqual(['46']); // two routes, one location
    expect(inserted.inventory_checks).toEqual([
      expect.objectContaining({ location_id: 'L1', trigger: 'nightly', warehouses: ['Primary'], error: null }),
    ]);
    expect(inserted.inventory_check_lines).toEqual([
      expect.objectContaining({ check_id: 'check-1', sku: 'FPS0018', name: 'Smooth Service Shampoo', ns_on_hand: 10, wms_on_hand: 8 }),
    ]);
    expect(results[0].summary).toMatchObject({ different: 1, productUnitsOff: 2 });
    expect(deleted).toEqual([{ table: 'inventory_checks', filter: 'before 2025-09-07T06:00:00.000Z' }]);
  });

  it('a failed read is stored as a failed check with no lines', async () => {
    const { db, inserted } = fakeDb(routes, []);
    const results = await runInventoryCheck(
      db,
      {
        fetchNetSuite: async () => [],
        fetchWarehouse: async () => {
          throw new Error('token expired');
        },
      },
      { trigger: 'manual', checkedBy: 'admin-1', now },
    );
    expect(inserted.inventory_checks[0]).toMatchObject({ error: 'ShipHero: token expired', checked_by: 'admin-1' });
    expect(inserted.inventory_check_lines).toEqual([]);
    expect(results[0].error).toBe('ShipHero: token expired');
  });

  it('no ships-from location is an error, not an empty check', async () => {
    const { db } = fakeDb([], []);
    await expect(
      runInventoryCheck(db, { fetchNetSuite: async () => [], fetchWarehouse: async () => ({ rows: [], warehouses: [] }) }, { trigger: 'nightly', now }),
    ).rejects.toThrow('No ships-from location');
  });
});
