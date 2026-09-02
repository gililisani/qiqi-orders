/**
 * Shipment types — the owner's ShipHero configuration table (doc
 * "Qiqi HUB Ship Hero Configurations", locked 2026-09-01).
 *
 * Single source of truth for:
 *  - the order-form "Shipment type" dropdown (code stored on
 *    orders.shipment_type, label shown to the user)
 *  - the /api/orders/save value check and the DB CHECK constraint
 *    (migration 20260901120000)
 *  - ShipHero order construction: tags, shipping carrier/method and the
 *    -SUFFIX segment of the warehouse order number
 *    ({NS SO}-{Country}-{code}, e.g. SOIL10999-Greece-SEA)
 *
 * Tag spellings are the LIVE BrandFox automation-rule triggers verified
 * against the ShipHero account ("WHOLESALE-…"); the doc's "WHOLSALE-…"
 * was a typo (owner-confirmed). Don't "correct" them back.
 *
 * Carrier is ShipHero's MACHINE key 'genericlabel', not the UI label
 * "Generic" — verified against the first live test (2026-09-02): sending
 * 'Generic' isn't recognized and ShipHero's UI falls back to a wrong
 * carrier ("Amazon Carrier"). Manual orders store carrier=genericlabel.
 *
 * "Cheapest"/"4" = ShipHero rate shopping (cheapest rate, 4-day window) —
 * how the API encodes it must be verified against a live order before the
 * first STANDARD/DDP push (no such order exists yet to copy from).
 */

export interface ShipmentType {
  /** Stored on orders.shipment_type and used as the order-number suffix. */
  code: 'SEA' | 'AIR' | 'LTL' | 'STANDARD' | 'DDP' | 'LABELS';
  /** Exact display name from the owner's doc. */
  label: string;
  /** ShipHero order tags — BrandFox automation rules key on these. */
  tags: readonly string[];
  /** Shipping line requested at order creation. */
  carrier: string;
  method: string;
}

export const SHIPMENT_TYPES: readonly ShipmentType[] = [
  {
    code: 'SEA',
    label: 'International Sea Freight',
    tags: ['WHOLESALE-SEAFREIGHT'],
    carrier: 'genericlabel',
    method: 'genericlabel',
  },
  {
    code: 'AIR',
    label: 'International Air Freight',
    tags: ['WHOLESALE-AIRFREIGHT'],
    carrier: 'genericlabel',
    method: 'genericlabel',
  },
  {
    code: 'LTL',
    label: 'USA Domestic – LTL',
    tags: ['WHOLESALE-DOMESTIC'],
    carrier: 'genericlabel',
    method: 'genericlabel',
  },
  {
    code: 'STANDARD',
    label: 'USA Domestic – Qiqi Shipping',
    tags: [],
    carrier: 'Cheapest',
    method: '4',
  },
  {
    code: 'DDP',
    label: 'International – Qiqi Shipping',
    tags: [],
    carrier: 'Cheapest',
    method: '4',
  },
  {
    code: 'LABELS',
    label: 'International – Use My Labels',
    tags: ['LABELS-ATTACHED'],
    carrier: 'genericlabel',
    method: 'genericlabel',
  },
] as const;

export type ShipmentTypeCode = ShipmentType['code'];

export const SHIPMENT_TYPE_CODES: readonly string[] = SHIPMENT_TYPES.map((t) => t.code);

/** Tolerant lookup (trims + uppercases); undefined for unknown/legacy values. */
export function shipmentTypeByCode(code: string | null | undefined): ShipmentType | undefined {
  if (!code) return undefined;
  const c = String(code).trim().toUpperCase();
  return SHIPMENT_TYPES.find((t) => t.code === c);
}

/** Display label for a stored code; falls back to the raw value (legacy rows). */
export function shipmentTypeLabel(code: string | null | undefined): string {
  return shipmentTypeByCode(code)?.label ?? (code ?? '');
}
