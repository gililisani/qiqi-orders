/**
 * Shopify fulfillments → FulfillmentPlans (Loop B input). Pure.
 *
 * One NS Item Fulfillment per Shopify fulfillment (partial shipments =
 * several IFs), keyed by the Shopify fulfillment id. Lot numbers are NOT
 * decided here — Shopify carries no lot data; the engine assigns FEFO at
 * write time (pending ops confirmation that ShipHero ships oldest-first).
 */
import type { ShopifyOrder } from './types';

export interface FulfillmentPlanLine {
  sku: string | null;
  shopifyLineItemId: string;
  quantity: number;
}

export interface FulfillmentPlan {
  shopifyFulfillmentId: string; // numeric
  shopifyOrderId: string; // numeric
  orderName: string;
  createdAt: string;
  tracking: Array<{ carrier: string | null; number: string | null; url: string | null }>;
  lines: FulfillmentPlanLine[];
}

const gidNum = (gid: string) => gid.replace(/^.*\//, '');

export function buildFulfillmentPlans(order: ShopifyOrder): FulfillmentPlan[] {
  return order.fulfillments
    .filter((f) => f.status === 'SUCCESS')
    .map((f) => ({
      shopifyFulfillmentId: gidNum(f.id),
      shopifyOrderId: gidNum(order.id),
      orderName: order.name,
      createdAt: f.createdAt,
      tracking: f.trackingInfo.map((t) => ({ carrier: t.company, number: t.number, url: t.url })),
      lines: f.fulfillmentLineItems.nodes.map((n) => ({
        sku: n.lineItem.sku,
        shopifyLineItemId: gidNum(n.lineItem.id),
        quantity: n.quantity,
      })),
    }));
}
