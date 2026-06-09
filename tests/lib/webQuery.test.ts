import { describe, it, expect } from 'vitest';
import { parseStockMatrixHtml } from '@/lib/inventory/webQuery';

// A faithful slice of real NetSuite web-query output: header row + data rows
// with the Excel "=" formula prefix, thousands commas, decimals, negatives,
// HTML entities, blanks, and a Hebrew location name.
const SAMPLE = `<html><head></head><body><table>
<tr><td>Quantity On Hand</td><td>Name (Grouped)</td><td>Display Name</td><td>null</td></tr>
<tr><td>=-700</td><td>TOL0005</td><td>Heat Cap USA - BLACK</td><td>DHL</td></tr>
<tr><td>=9,336</td><td>FPS0019</td><td>Hydration Fixation Conditioner 300 ml / 10.1 oz</td><td>Packable - Qiqi GLOBAL</td></tr>
<tr><td>=13.75</td><td>FPS0002</td><td>Qiqi Makes You Feel &amp; Smell Good</td><td>Expack USA</td></tr>
<tr><td>=-22,946</td><td>COM0067</td><td>Bottle</td><td>Main</td></tr>
<tr><td></td><td>FPS0019</td><td>Hydration Fixation Conditioner 300 ml / 10.1 oz</td><td>Bio-Direct</td></tr>
<tr><td>=4</td><td>KIT0010</td><td>Sample Kit</td><td>שרל מעבדה קוסמטית בעמ</td></tr>
</table></body></html>`;

describe('parseStockMatrixHtml', () => {
  const rows = parseStockMatrixHtml(SAMPLE);

  it('drops the header row and blank-quantity rows', () => {
    // 6 data <tr> in the sample, but one has an empty quantity cell -> skipped.
    expect(rows).toHaveLength(5);
    expect(rows.some((r) => r.itemCode === 'Name (Grouped)')).toBe(false);
  });

  it('strips the Excel "=" prefix and thousands commas', () => {
    expect(rows.find((r) => r.itemCode === 'FPS0019')?.qoh).toBe(9336);
    expect(rows.find((r) => r.itemCode === 'COM0067')?.qoh).toBe(-22946);
  });

  it('preserves negatives and decimals', () => {
    expect(rows.find((r) => r.itemCode === 'TOL0005')?.qoh).toBe(-700);
    expect(rows.find((r) => r.itemCode === 'FPS0002')?.qoh).toBe(13.75);
  });

  it('decodes HTML entities and non-ASCII locations', () => {
    expect(rows.find((r) => r.itemCode === 'FPS0002')?.displayName).toBe(
      'Qiqi Makes You Feel & Smell Good',
    );
    expect(rows.find((r) => r.itemCode === 'KIT0010')?.location).toBe('שרל מעבדה קוסמטית בעמ');
  });

  it('maps columns to (itemCode, displayName, location, qoh)', () => {
    const tol = rows.find((r) => r.itemCode === 'TOL0005');
    expect(tol).toEqual({
      itemCode: 'TOL0005',
      displayName: 'Heat Cap USA - BLACK',
      location: 'DHL',
      qoh: -700,
    });
  });
});
