import { describe, it, expect } from 'vitest';
import {
  SHIPMENT_TYPES,
  SHIPMENT_TYPE_CODES,
  shipmentTypeByCode,
  shipmentTypeLabel,
} from '@/lib/shipmentTypes';

// The owner's config table ("Qiqi HUB Ship Hero Configurations", 2026-09-01).
// Tag spellings are the LIVE BrandFox automation triggers (WHOLESALE-*), not
// the doc's WHOLSALE-* typos — a regression here breaks their automations.
describe('SHIPMENT_TYPES', () => {
  it('matches the owner spec exactly', () => {
    expect(SHIPMENT_TYPE_CODES).toEqual(['SEA', 'AIR', 'LTL', 'STANDARD', 'DDP', 'LABELS']);
    const byCode = Object.fromEntries(SHIPMENT_TYPES.map((t) => [t.code, t]));
    expect(byCode.SEA).toMatchObject({ tags: ['WHOLESALE-SEAFREIGHT'], carrier: 'genericlabel', method: 'genericlabel' });
    expect(byCode.AIR).toMatchObject({ tags: ['WHOLESALE-AIRFREIGHT'], carrier: 'genericlabel', method: 'genericlabel' });
    expect(byCode.LTL).toMatchObject({ tags: ['WHOLESALE-DOMESTIC'], carrier: 'genericlabel', method: 'genericlabel' });
    expect(byCode.STANDARD).toMatchObject({ tags: [], carrier: 'Cheapest', method: '4' });
    expect(byCode.DDP).toMatchObject({ tags: [], carrier: 'Cheapest', method: '4' });
    expect(byCode.LABELS).toMatchObject({ tags: ['LABELS-ATTACHED'], carrier: 'genericlabel', method: 'genericlabel' });
  });

  it('every label is the exact display name from the doc', () => {
    expect(SHIPMENT_TYPES.map((t) => t.label)).toEqual([
      'International Sea Freight',
      'International Air Freight',
      'USA Domestic – LTL',
      'USA Domestic – Qiqi Shipping',
      'International – Qiqi Shipping',
      'International – Use My Labels',
    ]);
  });
});

describe('shipmentTypeByCode', () => {
  it('is tolerant to case and whitespace', () => {
    expect(shipmentTypeByCode(' sea ')?.code).toBe('SEA');
    expect(shipmentTypeByCode('Air')?.code).toBe('AIR');
  });

  it('returns undefined for unknown/legacy values', () => {
    expect(shipmentTypeByCode('Air Shipping')).toBeUndefined();
    expect(shipmentTypeByCode(null)).toBeUndefined();
    expect(shipmentTypeByCode('')).toBeUndefined();
  });
});

describe('shipmentTypeLabel', () => {
  it('maps codes to display names', () => {
    expect(shipmentTypeLabel('SEA')).toBe('International Sea Freight');
  });

  it('falls back to the raw value for legacy rows', () => {
    expect(shipmentTypeLabel('Air Shipping')).toBe('Air Shipping');
    expect(shipmentTypeLabel(null)).toBe('');
  });
});
