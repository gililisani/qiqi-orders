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
    .filter((f) => f.endsWith('.json') && !f.startsWith('payout'))
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

/**
 * A $0 replacement built from a real fixture: every line 100% discounted,
 * no tax, free shipping, no payment, not shipped (#7507/#7559 shape).
 */
export function zeroOrder(name = 'b2c-latest'): ShopifyOrder {
  const o = loadOrder(name) as any;
  const zero = () => ({ shopMoney: { amount: '0.00', currencyCode: 'USD' } });
  o.discountApplications = { nodes: [{ index: 0, title: 'Replacement', code: null }] };
  for (const li of o.lineItems.nodes) {
    li.discountAllocations = [{ allocatedAmountSet: li.originalTotalSet, discountApplication: { index: 0 } }];
    li.taxLines = [];
  }
  for (const s of o.shippingLines.nodes) {
    s.discountedPriceSet = zero();
    s.taxLines = [];
    s.discountAllocations = [];
  }
  o.taxLines = [];
  o.currentSubtotalPriceSet = zero();
  o.currentTotalTaxSet = zero();
  o.currentShippingPriceSet = zero();
  o.currentTotalPriceSet = zero();
  o.totalPriceSet = zero();
  o.totalRefundedSet = zero();
  delete o.currentTotalDutiesSet;
  o.transactions = [];
  o.fulfillments = [];
  o.refunds = [];
  o.displayFinancialStatus = 'PAID';
  o.cancelledAt = null;
  o.tags = ['Replacement'];
  o.note = 'Replacement for #7369 – damaged in transit';
  return o;
}
