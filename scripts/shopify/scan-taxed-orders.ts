/**
 * Read-only: scan the last 90 days for orders that charged tax — who,
 * where, which jurisdictions, how much. Quantifies the "are we collecting
 * US tax?" question.
 *
 *   npx tsx scripts/shopify/scan-taxed-orders.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { shopifyPaginate } from '../../lib/shopify/client';

const Q = `
  query TaxScan($q: String!, $cursor: String) {
    orders(first: 100, after: $cursor, sortKey: CREATED_AT, query: $q) {
      nodes {
        name createdAt sourceName
        purchasingEntity { __typename }
        shippingAddress { provinceCode countryCodeV2 }
        currentTotalTaxSet { shopMoney { amount } }
        currentTotalPriceSet { shopMoney { amount } }
        taxLines { title ratePercentage priceSet { shopMoney { amount } } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

async function main() {
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const orders = await shopifyPaginate<any>(Q, { q: `created_at:>='${since}'` }, 'orders');
  const taxed = orders.filter((o) => Number(o.currentTotalTaxSet.shopMoney.amount) > 0);
  console.log(`scanned ${orders.length} orders since ${since}; ${taxed.length} charged tax`);

  const byPlace = new Map<string, { n: number; taxSum: number }>();
  for (const o of taxed) {
    const place = `${o.shippingAddress?.countryCodeV2 ?? '??'}-${o.shippingAddress?.provinceCode ?? '??'}`;
    const cur = byPlace.get(place) ?? { n: 0, taxSum: 0 };
    cur.n += 1;
    cur.taxSum += Number(o.currentTotalTaxSet.shopMoney.amount);
    byPlace.set(place, cur);
  }
  for (const [place, v] of [...byPlace.entries()].sort((a, b) => b[1].taxSum - a[1].taxSum)) {
    console.log(`  ${place}: ${v.n} orders, $${v.taxSum.toFixed(2)} tax`);
  }
  for (const o of taxed.slice(0, 10)) {
    console.log(
      `  ${o.name} ${o.createdAt.slice(0, 10)} ${o.purchasingEntity?.__typename ?? '-'} ` +
        `${o.shippingAddress?.countryCodeV2 ?? '?'}/${o.shippingAddress?.provinceCode ?? '?'} ` +
        `total $${o.currentTotalPriceSet.shopMoney.amount} tax: ` +
        o.taxLines.map((t: any) => `${t.title}@${t.ratePercentage}%=$${t.priceSet.shopMoney.amount}`).join(' + '),
    );
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
