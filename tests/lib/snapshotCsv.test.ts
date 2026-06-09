import { describe, expect, it } from 'vitest';
import { parseSnapshotCsv } from '@/lib/inventory/openingSnapshot';

describe('parseSnapshotCsv', () => {
  it('parses LONG format (Item, Location, Quantity On Hand)', () => {
    const csv = [
      'Item,Location,Quantity On Hand',
      'FPS0017,DHL,1169',
      'COM0067,Bio-Direct,932',
      'Total,,2101', // ignored
    ].join('\n');
    const { rows, errors } = parseSnapshotCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toContainEqual({ itemCode: 'FPS0017', locationName: 'DHL', qty: 1169 });
    expect(rows.find((r) => r.itemCode.toLowerCase() === 'total')).toBeUndefined();
  });

  it('parses MATRIX format (location-per-column with a Quantity On Hand sub-header)', () => {
    const csv = [
      'Name (Grouped) ,Display Name ,Bio-Direct ,DHL ,Main ',
      '  ,,Quantity On Hand ,Quantity On Hand ,Quantity On Hand ',
      'FPS0017,Super Soaker Masque,0,"1,169",',
      'COM0067,Label,932,0,',
      'Total,,"932","1,169",',
    ].join('\n');
    const { rows, errors } = parseSnapshotCsv(csv);
    expect(errors).toHaveLength(0);
    // blank cell (Main for FPS0017) → omitted, treated as opening 0 downstream
    expect(rows).toContainEqual({ itemCode: 'FPS0017', locationName: 'DHL', qty: 1169 });
    expect(rows).toContainEqual({ itemCode: 'FPS0017', locationName: 'Bio-Direct', qty: 0 });
    expect(rows).toContainEqual({ itemCode: 'COM0067', locationName: 'Bio-Direct', qty: 932 });
    expect(rows.find((r) => r.itemCode === 'FPS0017' && r.locationName === 'Main')).toBeUndefined();
    expect(rows.find((r) => r.itemCode.toLowerCase() === 'total')).toBeUndefined();
  });

  it('handles thousands separators and decimals', () => {
    const csv = ['Item,Location,Quantity On Hand', 'COM0050,Critzas,"965.1135"', 'COM0049,DHL,"112,618"'].join('\n');
    const { rows } = parseSnapshotCsv(csv);
    expect(rows.find((r) => r.itemCode === 'COM0050')!.qty).toBeCloseTo(965.1135);
    expect(rows.find((r) => r.itemCode === 'COM0049')!.qty).toBe(112618);
  });

  it('reports an error for an unrecognized shape', () => {
    const { rows, errors } = parseSnapshotCsv('Foo,Bar\n1,2');
    expect(rows).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});
