import fs from 'fs';
import path from 'path';
import type { ShopifyOrder } from '@/lib/shopify/core/types';

const DIR = path.join(__dirname, '..', 'fixtures', 'shopify');

export function loadOrder(name: string): ShopifyOrder {
  return JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
}

export function allFixtureNames(): string[] {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

/** Every SKU appearing in the fixture set — stands in for the NS item map. */
export function fixtureSkus(): Set<string> {
  const skus = new Set<string>();
  for (const n of allFixtureNames()) {
    for (const li of loadOrder(n).lineItems.nodes) {
      const sku = li.sku ?? li.variant?.sku;
      if (sku) skus.add(sku);
    }
  }
  return skus;
}
