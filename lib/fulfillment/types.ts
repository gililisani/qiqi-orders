/**
 * Provider-agnostic fulfillment layer — the "write once" interface.
 *
 * The Hub talks to a 3PL/WMS only through these types. Switching or adding a
 * warehouse later means writing a new adapter (e.g. `lib/fulfillment/shiphero/`)
 * that implements `FulfillmentProvider` — not touching the Hub trigger logic,
 * the DB columns, or the webhook route.
 *
 * Modelled after how `lib/netsuite.ts` is isolated from its callers.
 */

// Normalized fulfillment status the Hub stores on `orders.fulfillment_status`.
// Every provider maps its own vocabulary onto these.
export type FulfillmentStatus =
  | 'pending'           // accepted by the WMS, not yet fulfilled
  | 'ready_for_pickup'  // ExWorks case: fulfilled with a "generic"/pickup carrier
  | 'shipped'           // fulfilled with a real carrier (the rare CC-shipped case)
  | 'cancelled'
  | 'unknown';

export interface NormalizedAddress {
  name?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface NormalizedLineItem {
  sku: string;
  quantity: number;
  /** Unit price in the order currency. */
  unitPrice: number;
  /** Stable per-line id echoed back by the provider; defaults to the Hub line id. */
  partnerLineItemId: string;
  productName?: string | null;
}

/**
 * A Hub order in provider-neutral form. The hub→normalized conversion lives in
 * `lib/fulfillment/normalize.ts`; provider adapters consume only this.
 */
export interface NormalizedOrder {
  /** Hub order UUID — becomes the provider `partner_order_id` (dedup key). */
  orderId: string;
  /** Human-facing number (so_number / po_number) — becomes `order_number`. */
  orderNumber: string;
  /** ISO date. */
  orderDate: string;
  currency?: string | null;
  shipTo: NormalizedAddress;
  lineItems: NormalizedLineItem[];
}

export interface CreateOrderResult {
  /** Provider order id (e.g. ShipHero global id). Stored as external_fulfillment_id. */
  externalId: string | null;
  /** Provider legacy/integer id when available. */
  externalLegacyId?: string | null;
  /** True when the call was suppressed by the dry-run gate (nothing was sent). */
  dryRun: boolean;
  /** The exact payload that was (or would have been) sent — useful for dry-run review + logs. */
  request: unknown;
  raw?: unknown;
}

export type FulfillmentEventType = 'shipment_update' | 'order_cancelled' | 'other';

/**
 * A provider webhook normalized to what the Hub cares about. The provider's
 * `parseWebhook` returns this (or null if the payload is irrelevant/unparseable).
 */
export interface NormalizedFulfillmentEvent {
  type: FulfillmentEventType;
  /** Provider order id, when present on the event. */
  externalOrderId?: string | null;
  /** Our hub order id echoed back via partner_order_id. */
  partnerOrderId?: string | null;
  /** Human order number echoed back. */
  orderNumber?: string | null;
  status: FulfillmentStatus;
  trackingNumber?: string | null;
  carrier?: string | null;
  shippingMethod?: string | null;
  raw?: unknown;
}

/**
 * The contract every WMS adapter implements.
 */
export interface FulfillmentProvider {
  /** Stable provider key stored on orders.fulfillment_provider (e.g. 'shiphero'). */
  readonly name: string;

  /** Whether live mutations are suppressed (dry-run gate). */
  readonly dryRun: boolean;

  /** Create the order in the WMS. Respects the dry-run gate. */
  createOrder(order: NormalizedOrder): Promise<CreateOrderResult>;

  /**
   * Parse + verify an inbound webhook. Returns the normalized event, or null if
   * the payload is not one we act on. Implementations must be pure/synchronous-ish
   * and fast (webhook handlers have tight timeouts).
   */
  parseWebhook(args: {
    rawBody: string;
    headers: Record<string, string>;
    /** Secret token carried in the callback URL (?token=...), for verification. */
    urlToken?: string | null;
  }): NormalizedFulfillmentEvent | null;

  /** Register our webhook endpoint with the provider. Respects the dry-run gate. */
  registerWebhook?(url: string): Promise<{ id: string | null; dryRun: boolean; raw?: unknown }>;
}
