// Read-only: fetch one order by name, print its money shape.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { shopifyPaginate } from '../../lib/shopify/client';
import { ORDER_SELECTION } from '../../lib/shopify/orderQuery';
import type { ShopifyOrder } from '../../lib/shopify/core/types';

async function main() {
  const name = process.argv[2];
  const orders = await shopifyPaginate<ShopifyOrder>(
    `query ByName($q: String!, $cursor: String) {
      orders(first: 5, after: $cursor, query: $q) { nodes { ${ORDER_SELECTION} } pageInfo { hasNextPage endCursor } }
    }`,
    { q: `name:${name}` },
    'orders',
  );
  const o = orders.find((x) => x.name === name);
  if (!o) throw new Error('not found');
  console.log(JSON.stringify({
    id: o.id, name: o.name, created: o.createdAt,
    country: o.shippingAddress?.countryCodeV2,
    buyer: o.purchasingEntity?.__typename,
    total: o.currentTotalPriceSet.shopMoney.amount,
    tax: o.currentTotalTaxSet.shopMoney.amount,
    taxLines: o.taxLines.map((t) => ({ t: t.title, r: t.ratePercentage, amt: t.priceSet.shopMoney.amount, channelLiable: t.channelLiable })),
    shipping: o.currentShippingPriceSet.shopMoney.amount,
    discounts: o.currentTotalDiscountsSet.shopMoney.amount,
    lines: o.lineItems.nodes.map((l) => ({ sku: l.sku, qty: l.quantity, total: l.originalTotalSet.shopMoney.amount })),
    fulfillment: o.displayFulfillmentStatus,
  }, null, 1));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
