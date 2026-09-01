import { describe, it, expect } from 'vitest';
import {
  classifyMonthReturns,
  isRestockable,
  returnRowSkus,
} from '@/lib/amazonFba/returnsRestock';
import type { SkuResolution } from '@/lib/amazonFba/buildFromAmazon';

const SKU_MAP = new Map<string, SkuResolution>([
  ['FPS0028-FBA', { nsItemId: '1095', nsItemName: 'Hydration Fixation Conditioner 75ml' }],
  ['FPS000180-FBA', { nsItemId: '1046', nsItemName: 'Smooth Service Shampoo 300 ml' }],
]);

const row = (over: Partial<Record<string, string>> = {}): Record<string, string> => ({
  'return-date': '2026-09-14T07:03:57+00:00',
  'order-id': '113-2355691-4739435',
  sku: 'FPS0028-FBA',
  quantity: '1',
  'detailed-disposition': 'SELLABLE',
  status: 'Unit returned to inventory',
  reason: 'UNWANTED_ITEM',
  ...over,
});

describe('isRestockable', () => {
  it('restocks only sellable units that Amazon put back into inventory', () => {
    expect(isRestockable('SELLABLE', 'Unit returned to inventory')).toBe(true);
    expect(isRestockable('CUSTOMER_DAMAGED', 'Unit returned to inventory')).toBe(false);
    expect(isRestockable('DEFECTIVE', 'Unit returned to inventory')).toBe(false);
    expect(isRestockable('EXPIRED', 'Unit returned to inventory')).toBe(false);
    // Sellable grading but the unit never made it back to stock.
    expect(isRestockable('SELLABLE', 'Reimbursed')).toBe(false);
    expect(isRestockable('', '')).toBe(false);
  });
});

describe('classifyMonthReturns', () => {
  it('splits restock vs non-restock and aggregates restock per NetSuite item', () => {
    const result = classifyMonthReturns(
      [
        row(),
        row({ 'order-id': '114-2580324-9975436' }),
        row({ sku: 'FPS000180-FBA', 'order-id': '113-1726035-7909017' }),
        row({ 'detailed-disposition': 'CUSTOMER_DAMAGED', 'order-id': '111-0641626-3301825' }),
      ],
      SKU_MAP
    );

    expect(result.restockUnits).toBe(3);
    expect(result.nonRestockUnits).toBe(1);
    expect(result.unresolvedSkus).toEqual([]);
    expect(result.restockLines).toHaveLength(2);

    const conditioner = result.restockLines.find((l) => l.nsItemId === '1095');
    expect(conditioner?.quantity).toBe(2);
    expect(conditioner?.orderIds).toEqual(['113-2355691-4739435', '114-2580324-9975436']);
  });

  it('respects the quantity column', () => {
    const result = classifyMonthReturns([row({ quantity: '3' })], SKU_MAP);
    expect(result.restockUnits).toBe(3);
    expect(result.restockLines[0].quantity).toBe(3);
  });

  it('surfaces unmapped restockable SKUs instead of restocking them', () => {
    const result = classifyMonthReturns([row({ sku: 'MYSTERY-SKU' })], SKU_MAP);
    expect(result.restockUnits).toBe(0);
    expect(result.restockLines).toEqual([]);
    expect(result.unresolvedSkus).toEqual(['MYSTERY-SKU']);
    // The unit is still listed for the month card.
    expect(result.units).toHaveLength(1);
    expect(result.units[0].restock).toBe(false);
  });

  it('does not flag unmapped SKUs on damaged units (nothing to restock anyway)', () => {
    const result = classifyMonthReturns(
      [row({ sku: 'MYSTERY-SKU', 'detailed-disposition': 'CUSTOMER_DAMAGED' })],
      SKU_MAP
    );
    expect(result.unresolvedSkus).toEqual([]);
    expect(result.nonRestockUnits).toBe(1);
  });

  it('resolves a raw seller SKU via its normalized form as fallback', () => {
    const mapByNormalized = new Map<string, SkuResolution>([
      ['FPS0028', { nsItemId: '1095', nsItemName: 'Hydration Fixation Conditioner 75ml' }],
    ]);
    const result = classifyMonthReturns([row()], mapByNormalized);
    expect(result.restockUnits).toBe(1);
    expect(result.restockLines[0].nsItemId).toBe('1095');
  });
});

describe('returnRowSkus', () => {
  it('dedupes and drops empties', () => {
    expect(
      returnRowSkus([row(), row(), row({ sku: 'FPS000180-FBA' }), row({ sku: '' })])
    ).toEqual(['FPS0028-FBA', 'FPS000180-FBA']);
  });
});
