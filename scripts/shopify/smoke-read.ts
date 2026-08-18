/**
 * Read-only smoke test for the Shopify Admin API connection.
 * Verifies: auth works, GraphQL reachable, orders/customers/companies visible.
 *
 *   npx tsx scripts/shopify/smoke-read.ts
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
const API_VERSION = '2026-07';

async function gql(query: string): Promise<any> {
  const res = await fetch(`https://${DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (!res.ok || data.errors) {
    throw new Error(`GraphQL error (HTTP ${res.status}): ${JSON.stringify(data.errors ?? data).slice(0, 500)}`);
  }
  return data.data;
}

async function main() {
  const shop = await gql(`{ shop { name myshopifyDomain currencyCode ianaTimezone plan { displayName } } }`);
  console.log('SHOP:', JSON.stringify(shop.shop));

  const counts = await gql(`{
    ordersCount(limit: 10000) { count precision }
    customersCount { count precision }
    companiesCount { count precision }
  }`);
  console.log('COUNTS:', JSON.stringify(counts));

  const recent = await gql(`{
    orders(first: 3, reverse: true, sortKey: CREATED_AT) {
      nodes {
        name createdAt displayFinancialStatus displayFulfillmentStatus
        sourceName
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        customer { id }
        purchasingEntity { __typename }
        lineItems(first: 1) { nodes { sku quantity } }
      }
    }
  }`);
  for (const o of recent.orders.nodes) {
    console.log('ORDER:', JSON.stringify(o));
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
