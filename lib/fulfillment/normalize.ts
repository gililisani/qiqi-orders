import type { NormalizedOrder, NormalizedLineItem } from './types';
import { shipmentTypeByCode } from '../shipmentTypes';

/**
 * Hub → provider-neutral order conversion. App-specific (knows the Hub's order /
 * company / order_items shapes), but provider-agnostic (no ShipHero here). This
 * is the analogue of the old `build3PLExportPayload`, but it targets the
 * normalized interface instead of a SellerCloud spreadsheet.
 *
 * Pure + tolerant: trims strings, coerces nulls, and never strict-matches domain
 * text. Returns a NormalizedOrder ready for any `FulfillmentProvider`.
 */

export interface HubOrderForFulfillment {
  id: string;
  so_number?: string | null;
  po_number?: string | null;
  created_at: string;
  currency?: string | null;
  /** Shipment type code (SEA|AIR|LTL|STANDARD|DDP|LABELS) — see lib/shipmentTypes.ts. */
  shipment_type?: string | null;
}

export interface HubCompanyForFulfillment {
  company_name?: string | null;
  ship_to_contact_name?: string | null;
  ship_to_contact_email?: string | null;
  ship_to_contact_phone?: string | null;
  ship_to_street_line_1?: string | null;
  ship_to_street_line_2?: string | null;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  ship_to_postal_code?: string | null;
  ship_to_country?: string | null;
}

export interface HubItemForFulfillment {
  id?: string | null;
  quantity: number;
  unit_price: number;
  product?: { sku?: string | null; item_name?: string | null } | null;
}

function clean(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// The warehouse order number embeds the ship-to country. The owner's examples
// strip spaces ("PuertoRico", "HongKong") and abbreviate the two countries the
// Hub commonly spells long-form. Matching is tolerant (case/punctuation).
const COUNTRY_ABBREVIATIONS: Record<string, string> = {
  us: 'USA',
  usa: 'USA',
  unitedstates: 'USA',
  unitedstatesofamerica: 'USA',
  gb: 'UK',
  uk: 'UK',
  unitedkingdom: 'UK',
  greatbritain: 'UK',
};

/** "Puerto Rico" -> "PuertoRico", "United States" -> "USA". */
export function countryToken(country?: string | null): string | null {
  const s = clean(country);
  if (!s) return null;
  const key = s.toLowerCase().replace(/[^a-z]/g, '');
  if (COUNTRY_ABBREVIATIONS[key]) return COUNTRY_ABBREVIATIONS[key];
  const stripped = s.replace(/[^A-Za-z0-9]/g, '');
  return stripped || null;
}

/**
 * Warehouse order number per the owner's spec (doc 2026-09-01):
 * `{NS SO}-{Country}-{shipment type code}` — e.g. SOIL10999-Greece-SEA.
 * Returns null when any segment is missing (callers surface a clear error).
 */
export function buildWarehouseOrderNumber(params: {
  soNumber?: string | null;
  country?: string | null;
  shipmentTypeCode?: string | null;
}): string | null {
  const so = clean(params.soNumber);
  const country = countryToken(params.country);
  const type = shipmentTypeByCode(params.shipmentTypeCode);
  if (!so || !country || !type) return null;
  return `${so}-${country}-${type.code}`;
}

/** Split a free-text contact name into first/last. */
export function splitContactName(fullName?: string | null): { firstName: string; lastName: string } {
  const s = clean(fullName);
  if (!s) return { firstName: '', lastName: '' };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function buildNormalizedOrder(params: {
  order: HubOrderForFulfillment;
  company: HubCompanyForFulfillment;
  items: HubItemForFulfillment[];
}): NormalizedOrder {
  const { order, company, items } = params;

  const shipmentType = shipmentTypeByCode(order.shipment_type);

  // Warehouse order number: {SO}-{Country}-{type code}. Falls back to the old
  // so/po/uuid chain only when a segment is missing (the push route validates
  // the segments up front, so live pushes always get the full format).
  const orderNumber =
    buildWarehouseOrderNumber({
      soNumber: order.so_number,
      country: company.ship_to_country,
      shipmentTypeCode: order.shipment_type,
    }) ||
    clean(order.so_number) ||
    clean(order.po_number) ||
    order.id.substring(0, 8);

  // Consolidate duplicate SKUs by (sku, unit_price) — the SAME rule as the
  // NetSuite push (lib/netsuite.ts): a product ordered both regularly and as
  // a support-fund item is one warehouse line, not two. Verified against the
  // first live ShipHero test (2026-09-02), where the split lines confused
  // the warehouse view.
  const consolidated = new Map<string, NormalizedLineItem>();
  (items || []).forEach((item, idx) => {
    const sku = clean(item.product?.sku);
    if (!sku) return; // a line with no SKU can't be fulfilled — drop it
    const unitPrice = Number(item.unit_price) || 0;
    const key = `${sku}_${unitPrice}`;
    const existing = consolidated.get(key);
    if (existing) {
      existing.quantity += Number(item.quantity) || 0;
    } else {
      consolidated.set(key, {
        sku,
        quantity: Number(item.quantity) || 0,
        unitPrice,
        // Stable per-line id so the provider can echo it back on webhooks.
        partnerLineItemId: clean(item.id) || `${order.id}-${idx}`,
        productName: clean(item.product?.item_name),
      });
    }
  });
  const lineItems: NormalizedLineItem[] = [...consolidated.values()];

  return {
    orderId: order.id,
    orderNumber,
    orderDate: order.created_at,
    currency: clean(order.currency),
    tags: shipmentType ? [...shipmentType.tags] : [],
    shippingLine: shipmentType
      ? { title: shipmentType.label, carrier: shipmentType.carrier, method: shipmentType.method }
      : null,
    shipTo: {
      name: clean(company.ship_to_contact_name),
      company: clean(company.company_name),
      address1: clean(company.ship_to_street_line_1),
      address2: clean(company.ship_to_street_line_2),
      city: clean(company.ship_to_city),
      state: clean(company.ship_to_state),
      zip: clean(company.ship_to_postal_code),
      country: clean(company.ship_to_country),
      // The warehouse wants the phone without the "+" prefix (owner spec).
      phone: clean(company.ship_to_contact_phone)?.replace(/\+/g, '').trim() || null,
      email: clean(company.ship_to_contact_email),
    },
    lineItems,
  };
}
