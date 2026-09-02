import type { ShipHeroConfig } from './config';
import type { NormalizedOrder, NormalizedFulfillmentEvent, FulfillmentStatus, FulfillmentSnapshot } from '../types';
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
// Signal semantics (verified against BrandFox's live flow, 2026-09-01)
// ---------------------------------------------------------------------------
//
// BrandFox's observed lifecycle for a distributor order:
//   picking → packing → "packed" → "warehouse_completed"   (order_history)
//   … then, AFTER the freight pickup, a close-out: a shipment is created with
//   a generic label and the order flips to fulfillment_status "fulfilled".
//
// So: PACKED events (Order Packed Out webhook / packed history entries) are
// the "ready for pickup" signal, and SHIPMENT CREATION is the close-out —
// picked up / done. A generic-carrier label just means "no real tracking";
// it does NOT mean "still awaiting pickup". Matching stays TOLERANT
// (lowercase, whitespace-collapsed, substring) — this is domain text.
const GENERIC_PICKUP_TOKEN = 'generic';

// order_history phrases that mean the warehouse finished packing.
const PACKED_HISTORY_TOKENS = ['packed', 'warehouse_completed'];

// Fallback shipping line when the order carries no shipment type (legacy
// orders only — the shipment-type config in lib/shipmentTypes.ts is the
// normal source since 2026-09).
export const PICKUP_SHIPPING_LINE = {
  title: 'Wholesale Generic',
  // ShipHero's machine key — "Generic" is only the UI label (see
  // lib/shipmentTypes.ts, verified against the 2026-09-02 live test).
  carrier: 'genericlabel',
  method: 'genericlabel',
} as const;

function norm(v: string | null | undefined): string {
  return (v ?? '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
}

/** True when a shipment's carrier/method is a generic label (no real tracking). */
export function isPickupShipment(carrier?: string | null, method?: string | null): boolean {
  return norm(carrier).includes(GENERIC_PICKUP_TOKEN) || norm(method).includes(GENERIC_PICKUP_TOKEN);
}

/** True when a ShipHero order_history entry says the order finished packing. */
export function isPackedHistoryEntry(information?: string | null): boolean {
  const s = norm(information);
  if (!s) return false;
  // Only status-update lines count — packing NOTES ("…require unboxing
  // repacks…", "Reference Air Freight Packing Guidelines…") also contain
  // "pack" tokens but describe instructions, not progress.
  if (!s.includes('order status updated')) return false;
  return PACKED_HISTORY_TOKENS.some((t) => s.includes(t));
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
  /** BrandFox automation rules key on these (e.g. WHOLESALE-AIRFREIGHT). */
  tags?: string[];
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

export function buildShipHeroOrderInput(
  order: NormalizedOrder,
  config: ShipHeroConfig,
  // The date to record as the ShipHero order_date. This is the SUBMISSION date
  // (when we push to the WMS), NOT the Hub's original order-creation date — a
  // warehouse cares when the order arrived with them, and it keeps freshly
  // pushed orders at the top of ShipHero's date-sorted list.
  orderDate: string,
): ShipHeroOrderInput {
  const { firstName, lastName } = splitContactName(order.shipTo.name);
  const shippingLine = order.shippingLine ?? PICKUP_SHIPPING_LINE;

  const input: ShipHeroOrderInput = {
    order_number: order.orderNumber,
    partner_order_id: order.orderId,
    shop_name: config.shopName,
    fulfillment_status: 'pending',
    order_date: orderDate,
    total_tax: '0.00',
    total_discounts: '0.00',
    currency: order.currency || 'USD',
    shipping_lines: {
      title: shippingLine.title,
      price: '0.00',
      carrier: shippingLine.carrier,
      method: shippingLine.method,
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

  if (order.tags && order.tags.length > 0) {
    input.tags = [...order.tags];
  }

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

  // Order Packed Out — the warehouse finished packing: our READY signal.
  if (webhookType.includes('packed')) {
    return {
      type: 'packed_out',
      externalOrderId,
      partnerOrderId,
      orderNumber,
      status: 'ready_for_pickup',
      trackingNumber: null,
      carrier,
      shippingMethod: method,
      raw: payload,
    };
  }

  // Shipment Update — the warehouse CLOSED OUT the order (their post-pickup
  // action for ExWorks freight): our picked-up/done signal. Generic labels
  // carry no meaningful tracking; real carriers do.
  if (webhookType.includes('shipment')) {
    const pickup = isPickupShipment(carrier, method);
    return {
      type: 'shipment_update',
      externalOrderId,
      partnerOrderId,
      orderNumber,
      status: 'shipped',
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

// ---------------------------------------------------------------------------
// ShipHero order (pulled) → normalized fulfillment snapshot
// ---------------------------------------------------------------------------
//
// Used by the on-demand status sync and the polling cron. We deliberately do
// NOT trust ShipHero's order-level `fulfillment_status` for progress —
// BrandFox puts custom batch tags there ("Tomorrow", "QMS-Large") — except to
// detect cancellation. What we trust:
//   - a shipment/label exists  → closed out ('shipped'; the post-pickup step)
//   - order_history has a packed/warehouse_completed status update
//                              → packed ('ready_for_pickup')
//   - otherwise                → pending
export function parseShipHeroOrderFulfillment(orderData: any): FulfillmentSnapshot {
  if (!orderData || typeof orderData !== 'object') return { status: 'unknown' };

  const shipments = Array.isArray(orderData.shipments)
    ? orderData.shipments
    : orderData.shipments
      ? [orderData.shipments]
      : [];

  const labels = shipments.flatMap((s: any) => {
    const l = s?.shipping_labels;
    return Array.isArray(l) ? l : l ? [l] : [];
  });

  if (labels.length) {
    const label = labels[0];
    const carrier = pickString(label.carrier);
    const method = pickString(label.shipping_method);
    const pickup = isPickupShipment(carrier, method);
    return {
      status: 'shipped',
      trackingNumber: pickup ? null : pickString(label.tracking_number),
      carrier,
      shippingMethod: method,
      trackingUrl: pickString(label.tracking_url),
      raw: orderData,
    };
  }

  if (norm(orderData.fulfillment_status).includes('cancel')) {
    return { status: 'cancelled', raw: orderData };
  }

  const history = Array.isArray(orderData.order_history)
    ? orderData.order_history
    : orderData.order_history
      ? [orderData.order_history]
      : [];
  if (history.some((h: any) => isPackedHistoryEntry(h?.information))) {
    return { status: 'ready_for_pickup', raw: orderData };
  }

  return { status: 'pending', raw: orderData };
}
