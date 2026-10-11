/**
 * Inventory Check — read-only stock reads from both systems.
 *
 * NetSuite: aggregateItemLocation (one row per item × location, assemblies
 * included — inventoryitemlocations silently omits them; checked against
 * inventoryBalance sums 2026-10-11: identical on hand for all 30 SKUs).
 * ShipHero: warehouse_products for the customer account, one row per SKU ×
 * warehouse.
 */

import type { NetSuiteAPI } from '../netsuite';
import type { ShipHeroClient } from '../fulfillment/shiphero/client';
import type { NsStock, WmsStock } from './compare';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function fetchNetSuiteStock(ns: Pick<NetSuiteAPI, 'suiteQLPaged'>, locationNsId: string): Promise<NsStock[]> {
  if (!/^\d+$/.test(locationNsId)) throw new Error(`NetSuite location id "${locationNsId}" is not numeric`);
  const rows = await ns.suiteQLPaged<Record<string, unknown>>(
    `SELECT i.itemid AS sku, i.displayname AS name,
            l.quantityonhand AS onhand, l.quantityavailable AS available, l.quantitycommitted AS committed
       FROM aggregateItemLocation l
       JOIN item i ON i.id = l.item
      WHERE l.location = ${locationNsId}
        AND i.itemid IS NOT NULL`,
  );
  return rows.map((r) => ({
    sku: String(r.sku),
    name: r.name ? String(r.name) : null,
    onHand: num(r.onhand),
    available: num(r.available),
    committed: num(r.committed),
  }));
}

const WAREHOUSE_PRODUCTS = `
  query InventoryCheck($account: String, $after: String) {
    warehouse_products(customer_account_id: $account, active: true) {
      data(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          sku warehouse_identifier on_hand available allocated non_sellable_quantity
          product { name kit }
        } }
      }
    }
  }`;

export async function fetchShipHeroStock(
  client: Pick<ShipHeroClient, 'graphql'>,
  customerAccountId: string,
): Promise<{ rows: WmsStock[]; warehouses: string[] }> {
  const rows: WmsStock[] = [];
  const warehouses = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    const data: any = await client.graphql(WAREHOUSE_PRODUCTS, { account: customerAccountId, after });
    const conn = data?.warehouse_products?.data;
    for (const e of conn?.edges ?? []) {
      const n = e.node;
      if (!n?.sku) continue;
      if (n.warehouse_identifier) warehouses.add(String(n.warehouse_identifier));
      rows.push({
        sku: String(n.sku),
        name: n.product?.name ? String(n.product.name) : null,
        onHand: num(n.on_hand),
        available: num(n.available),
        allocated: num(n.allocated),
        nonSellable: num(n.non_sellable_quantity),
        kit: n.product?.kit === true,
      });
    }
    if (!conn?.pageInfo?.hasNextPage) return { rows, warehouses: [...warehouses].sort() };
    after = conn.pageInfo.endCursor;
  }
  throw new Error('ShipHero inventory: more than 5,000 SKUs — stopped paging');
}
