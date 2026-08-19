// Read-only: find recent orders with 2+ discount applications.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { shopifyPaginate } from '../../lib/shopify/client';

const Q = `
  query MD($q: String!, $cursor: String) {
    orders(first: 100, after: $cursor, sortKey: CREATED_AT, query: $q) {
      nodes {
        name createdAt
        currentTotalDiscountsSet { shopMoney { amount } }
        discountApplications(first: 10) {
          nodes {
            __typename
            ... on DiscountCodeApplication { code }
            ... on AutomaticDiscountApplication { title }
            ... on ManualDiscountApplication { title }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

async function main() {
  const since = '2026-07-15';
  const orders = await shopifyPaginate<any>(Q, { q: `created_at:>='${since}'` }, 'orders');
  const multi = orders.filter((o) =>
    o.discountApplications.nodes.some((d: any) => (d.title ?? d.code ?? '').includes('Pro Discount')),
  );
  console.log(`${orders.length} orders scanned since 2026-07-15, ${multi.length} with a Pro Discount`);
  for (const o of multi.slice(-10)) {
    const names = o.discountApplications.nodes.map((d: any) => d.code ?? d.title ?? d.__typename);
    console.log(`  ${o.name} (${o.createdAt.slice(0, 10)}): $${o.currentTotalDiscountsSet.shopMoney.amount} via [${names.join(' + ')}]`);
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
