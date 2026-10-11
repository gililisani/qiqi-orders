/**
 * Inventory Check — the real NetSuite + ShipHero readers. Kept apart from
 * run.ts so the orchestration stays testable without the API clients.
 */

import { createNetSuiteAPI } from '../netsuite';
import { ShipHeroClient } from '../fulfillment/shiphero/client';
import { getShipHeroConfig } from '../fulfillment/shiphero/config';
import { fetchNetSuiteStock, fetchShipHeroStock } from './sources';
import type { InventoryCheckDeps } from './run';

/** Why a check cannot run here (unconfigured environment), or null. */
export function inventoryCheckUnavailable(): string | null {
  if (!process.env.NETSUITE_ACCOUNT_ID) return 'NetSuite is not connected in this environment.';
  if (!process.env.SHIPHERO_REFRESH_TOKEN) return 'ShipHero is not connected in this environment.';
  if (!process.env.SHIPHERO_CUSTOMER_ACCOUNT_ID) return 'The ShipHero customer account is not set (SHIPHERO_CUSTOMER_ACCOUNT_ID).';
  return null;
}

export function liveInventoryCheckDeps(): InventoryCheckDeps {
  const ns = createNetSuiteAPI();
  const config = getShipHeroConfig();
  const shiphero = new ShipHeroClient(config);
  return {
    fetchNetSuite: (locationNsId) => fetchNetSuiteStock(ns, locationNsId),
    fetchWarehouse: () => fetchShipHeroStock(shiphero, config.customerAccountId!),
  };
}
