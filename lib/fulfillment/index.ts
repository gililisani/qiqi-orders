import type { FulfillmentProvider } from './types';
import { createShipHeroProvider } from './shiphero/adapter';

/**
 * Provider registry. The Hub selects a fulfillment provider by key (today only
 * ShipHero); adding a WMS later is a new case here + a new adapter, with no
 * change to callers. Config-driven selection (per company/warehouse) slots in
 * here when a second provider exists.
 */
export type FulfillmentProviderName = 'shiphero';

export function getFulfillmentProvider(name: FulfillmentProviderName = 'shiphero'): FulfillmentProvider {
  switch (name) {
    case 'shiphero':
      return createShipHeroProvider();
    default:
      throw new Error(`Unknown fulfillment provider: ${name}`);
  }
}

export * from './types';
