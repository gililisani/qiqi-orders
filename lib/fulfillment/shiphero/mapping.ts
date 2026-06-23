import type { ShipHeroConfig } from './config';
import type { NormalizedOrder, NormalizedFulfillmentEvent, FulfillmentStatus } from '../types';
import { splitContactName } from '../normalize';

/**
 * Pure ShipHero ⇄ Hub mapping. No network here — kept side-effect-free so it's
 * fully unit-testable (the adapter wires these to the GraphQL client).
 *
 * Field names verified against the live `CreateOrderInput` / `CreateLineItemInput`
 * / `CreateOrderAddressInput` / `CreateShippingLinesInput` schema (introspected
 * 2026-06-23).
 */

// ---------------------------------------------------------------------------
// Ready-for-pickup detection (ExWorks)
// ---------------------------------------------------------------------------
//
// BrandFox marks a pickup order ready by fulfilling it with shipment carrier
// "Generic" / "Wholesale Generic" and method "genericlabel" / "Wholesale Generic
// Label". The common token across all four is "generic", so we match TOLERANTLY
// (lowercase, whitespace-collapsed, substring) rather than strict-equals — the
// label wording is the kind of domain text that drifts.
const GENERIC_PICKUP_TOKEN = 'generic';

// What we put on the order's shipping line when creating it. These are the
// wholesale/pickup defaults BrandFox named. PENDING confirmation whether we
// should set this at create time or let BrandFox assign it at fulfillment.
export const PICKUP_SHIPPING_LINE = {
  title: 'Wholesale Generic',
  carrier: 'Generic',
  method: 'genericlabel',
} as const;

function norm(v: string | null | undefined): string {
  return (v ?? '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
}

/** True when a shipment's carrier/method indicates a generic pickup (no real tracking). */
export function isPickupShipment(carrier?: string | null, method?: string | null): boolean {
  return norm(carrier).includes(GENERIC_PICKUP_TOKEN) || norm(method).includes(GENERIC_PICKUP_TOKEN);
}

// ---------------------------------------------------------------------------
// Hub order → ShipHero order_create input
// ---------------------------------------------------------------------------

export interface ShipHeroOrderInput {
  order_number: string;
  partner_order_id: string;
  customer_account_id?: string;
  shop_name: string;
  fulfillment_status: string;
  order_date: string;
  total_tax: string;
  total_discounts: string;
  currency: string;
  shipping_lines: { title: string; price: string; carrier?: string; method?: string };
  shipping_address: Record<string, string | null>;
  line_items: Array<{
    sku: string;
    partner_line_item_id: string;
    quantity: number;
    price: string;
    product_name?: string | null;
    warehouse_id?: string;
  }>;
  email?: string | null;
}

function money(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

export function buildShipHeroOrderInput(order: NormalizedOrder, config: ShipHeroConfig): ShipHeroOrderInput {
  const { firstName, lastName } = splitContactName(order.shipTo.name);

  const input: ShipHeroOrderInput = {
    order_number: order.orderNumber,
    partner_order_id: order.orderId,
    shop_name: config.shopName,
    fulfillment_status: 'pending',
    order_date: order.orderDate,
    total_tax: '0.00',
    total_discounts: '0.00',
    currency: order.currency || 'USD',
    shipping_lines: {
      title: PICKUP_SHIPPING_LINE.title,
      price: '0.00',
      carrier: PICKUP_SHIPPING_LINE.carrier,
      method: PICKUP_SHIPPING_LINE.method,
    },
    shipping_address: {
      first_name: firstName || (order.shipTo.company ?? ''),
      last_name: lastName,
      company: order.shipTo.company ?? null,
      address1: order.shipTo.address1 ?? null,
      address2: order.shipTo.address2 ?? null,
      city: order.shipTo.city ?? null,
      state: order.shipTo.state ?? null,
      zip: order.shipTo.zip ?? null,
      country: order.shipTo.country ?? null,
      email: order.shipTo.email ?? null,
      phone: order.shipTo.phone ?? null,
    },
    line_items: order.lineItems.map((li) => ({
      sku: li.sku,
      partner_line_item_id: li.partnerLineItemId,
      quantity: li.quantity,
      price: money(li.unitPrice),
      product_name: li.productName ?? undefined,
      // Optional: pin allocation to Qiqi's warehouse when configured.
      ...(config.warehouseId ? { warehouse_id: config.warehouseId } : {}),
    })),
    email: order.shipTo.email,
  };

  // Scope the order to Qiqi's customer account on the master 3PL account.
  if (config.customerAccountId) {
    input.customer_account_id = config.customerAccountId;
  }

  return input;
}

// ---------------------------------------------------------------------------
// ShipHero webhook → normalized event
// ---------------------------------------------------------------------------
//
// ShipHero webhook payloads are NOT part of the GraphQL schema, so the field
// names below are read defensively across the shapes ShipHero is known to send
// (top-level fields + a `packages`/`fulfillment` sub-object). The exact shape
// MUST be confirmed against a real captured payload once the webhook is live;
// unknown payloads fall through to a safe normalized result with `raw` attached.

function pickString(...vals: Array<unknown>): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

export function parseShipHeroWebhook(payload: any): NormalizedFulfillmentEvent | null {
  if (!payload || typeof payload !== 'object') return null;

  const webhookType = norm(payload.webhook_type);
  const firstPackage = Array.isArray(payload.packages) ? payload.packages[0] : undefined;
  const fulfillment = payload.fulfillment ?? firstPackage ?? {};

  const carrier = pickString(payload.shipping_carrier, payload.carrier, fulfillment.carrier, fulfillment.shipping_carrier);
  const method = pickString(payload.shipping_method, fulfillment.shipping_method, fulfillment.method);
  const trackingNumber = pickString(payload.tracking_number, fulfillment.tracking_number);
  const externalOrderId = pickString(payload.order_id, payload.id);
  const partnerOrderId = pickString(payload.partner_order_id);
  const orderNumber = pickString(payload.order_number);

  // Cancellation webhooks.
  if (webhookType.includes('cancel')) {
    return {
      type: 'order_cancelled',
      externalOrderId,
      partnerOrderId,
      orderNumber,
      status: 'cancelled',
      carrier,
      shippingMethod: method,
      trackingNumber,
      raw: payload,
    };
  }

  // Shipment Update — our fulfillment/ready signal.
  if (webhookType.includes('shipment')) {
    const pickup = isPickupShipment(carrier, method);
    const status: FulfillmentStatus = pickup ? 'ready_for_pickup' : 'shipped';
    return {
      type: 'shipment_update',
      externalOrderId,
      partnerOrderId,
      orderNumber,
      status,
      // Generic/pickup shipments carry no meaningful tracking.
      trackingNumber: pickup ? null : trackingNumber,
      carrier,
      shippingMethod: method,
      raw: payload,
    };
  }

  // Anything else: surface it as an unacted "other" event for logging.
  return {
    type: 'other',
    externalOrderId,
    partnerOrderId,
    orderNumber,
    status: 'unknown',
    carrier,
    shippingMethod: method,
    trackingNumber,
    raw: payload,
  };
}
