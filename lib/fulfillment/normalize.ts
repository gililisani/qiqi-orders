import type { NormalizedOrder, NormalizedLineItem } from './types';

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

  // Prefer the SO number for the human order number, fall back to PO, then a
  // short slice of the UUID so the field is never empty.
  const orderNumber = clean(order.so_number) || clean(order.po_number) || order.id.substring(0, 8);

  const lineItems: NormalizedLineItem[] = (items || [])
    .map((item, idx): NormalizedLineItem | null => {
      const sku = clean(item.product?.sku);
      if (!sku) return null; // a line with no SKU can't be fulfilled — drop it
      return {
        sku,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unit_price) || 0,
        // Stable per-line id so the provider can echo it back on webhooks.
        partnerLineItemId: clean(item.id) || `${order.id}-${idx}`,
        productName: clean(item.product?.item_name),
      };
    })
    .filter((x): x is NormalizedLineItem => x !== null);

  return {
    orderId: order.id,
    orderNumber,
    orderDate: order.created_at,
    currency: clean(order.currency),
    shipTo: {
      name: clean(company.ship_to_contact_name),
      company: clean(company.company_name),
      address1: clean(company.ship_to_street_line_1),
      address2: clean(company.ship_to_street_line_2),
      city: clean(company.ship_to_city),
      state: clean(company.ship_to_state),
      zip: clean(company.ship_to_postal_code),
      country: clean(company.ship_to_country),
      phone: clean(company.ship_to_contact_phone),
      email: clean(company.ship_to_contact_email),
    },
    lineItems,
  };
}
