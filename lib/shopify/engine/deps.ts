/**
 * Production wiring for the poll engine's dependencies.
 */
import { shopifyPaginate } from '../client';
import { ORDERS_UPDATED_SINCE_QUERY } from '../orderQuery';
import { createNetSuiteAPI } from '../../netsuite';
import type { ShopifyOrder } from '../core/types';

export async function fetchOrdersUpdatedSince(isoTimestamp: string): Promise<ShopifyOrder[]> {
  // Shopify search wants "updated_at:>='2026-08-17T00:00:00Z'".
  const q = `updated_at:>='${isoTimestamp}'`;
  return shopifyPaginate<ShopifyOrder>(ORDERS_UPDATED_SINCE_QUERY, { q }, 'orders');
}

/**
 * The gate's SKU universe = every item code in NetSuite. One paged SuiteQL
 * read per poll (only when the poll actually fetched orders). Read-only —
 * safe against production NS even in shadow mode.
 */
export async function loadKnownSkus(): Promise<Set<string>> {
  const ns = createNetSuiteAPI();
  const rows = await ns.suiteQLPaged<{ itemid: string }>(
    `SELECT itemid FROM item WHERE isinactive = 'F'`,
  );
  return new Set(rows.map((r) => r.itemid));
}
