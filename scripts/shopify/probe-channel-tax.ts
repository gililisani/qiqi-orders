// Read-only: are the US-taxed orders Shop-channel orders with channelLiable tax?
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { shopifyGraphQL, shopifyPaginate } from '../../lib/shopify/client';

const Q = `
  query TaxScan($q: String!, $cursor: String) {
    orders(first: 100, after: $cursor, sortKey: CREATED_AT, query: $q) {
      nodes {
        name sourceName
        app { name }
        shippingAddress { provinceCode countryCodeV2 }
        currentTotalTaxSet { shopMoney { amount } }
        taxLines { title ratePercentage channelLiable priceSet { shopMoney { amount } } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

async function main() {
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const orders = await shopifyPaginate<any>(Q, { q: `created_at:>='${since}'` }, 'orders');
  const taxed = orders.filter((o: any) => Number(o.currentTotalTaxSet.shopMoney.amount) > 0);
  const chan = (o: any) => `src=${o.sourceName} app=${o.app?.name ?? '?'}`;
  console.log('--- US taxed orders ---');
  for (const o of taxed.filter((o: any) => o.shippingAddress?.countryCodeV2 === 'US')) {
    console.log(o.name, chan(o), JSON.stringify(o.taxLines));
  }
  console.log('--- channelLiable stats over all taxed orders ---');
  let cl = 0, notCl = 0;
  for (const o of taxed) for (const t of o.taxLines) (t.channelLiable ? cl++ : notCl++);
  console.log(`channelLiable tax lines: ${cl}, merchant-liable: ${notCl}`);
  console.log('--- sample international (merchant-liable?) ---');
  for (const o of taxed.filter((o: any) => o.shippingAddress?.countryCodeV2 !== 'US').slice(0, 3)) {
    console.log(o.name, chan(o), JSON.stringify(o.taxLines));
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
