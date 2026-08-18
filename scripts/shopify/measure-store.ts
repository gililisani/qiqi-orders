/**
 * Read-only store measurement: order volume, sales channels, payment
 * gateways, gift cards, currency spread, refund frequency. Informs the
 * sync design (poll sizing, archetype coverage). No writes.
 *
 *   npx tsx scripts/shopify/measure-store.ts
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
const API_VERSION = '2026-07';

async function gql(query: string, variables?: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://${DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (!res.ok || data.errors) {
    throw new Error(`GraphQL error (HTTP ${res.status}): ${JSON.stringify(data.errors ?? data).slice(0, 800)}`);
  }
  return data.data;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function count(q: string): Promise<number> {
  const d = await gql(`{ ordersCount(limit: 10000, query: ${JSON.stringify(q)}) { count } }`);
  return d.ordersCount.count;
}

async function main() {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 864e5);
  const d90 = new Date(now.getTime() - 90 * 864e5);
  const d365 = new Date(now.getTime() - 365 * 864e5);

  const [c30, c90, c365] = await Promise.all([
    count(`created_at:>='${iso(d30)}'`),
    count(`created_at:>='${iso(d90)}'`),
    count(`created_at:>='${iso(d365)}'`),
  ]);
  console.log(`VOLUME: last30d=${c30} (${(c30 / 30).toFixed(1)}/day)  last90d=${c90} (${(c90 / 90).toFixed(1)}/day)  last365d=${c365}`);

  const [refunded, partRefunded, pos, nonUsd] = await Promise.all([
    count(`financial_status:refunded created_at:>='${iso(d365)}'`),
    count(`financial_status:partially_refunded created_at:>='${iso(d365)}'`),
    count(`source_name:pos`),
    count(`-currency:USD`),
  ]);
  console.log(`LAST 365d: refunded=${refunded} partially_refunded=${partRefunded}`);
  console.log(`ALL TIME: pos_orders=${pos} non_usd_orders=${nonUsd}`);

  // Gift cards sold?
  const gc = await gql(`{ products(first: 5, query: "gift_card:true") { nodes { title status } } }`);
  console.log('GIFT_CARD_PRODUCTS:', JSON.stringify(gc.products.nodes));

  // Sample recent orders to enumerate gateways / channels / countries / tax shapes.
  const sample = await gql(`{
    orders(first: 120, reverse: true, sortKey: CREATED_AT) {
      nodes {
        name sourceName
        purchasingEntity { __typename }
        paymentGatewayNames
        shippingAddress { countryCodeV2 }
        taxLines { title ratePercentage priceSet { shopMoney { amount } } }
        currentTotalPriceSet { shopMoney { currencyCode } }
      }
    }
  }`);
  const tally = (arr: string[]) =>
    Object.entries(arr.reduce((m: Record<string, number>, k) => ((m[k] = (m[k] || 0) + 1), m), {}))
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
  const nodes = sample.orders.nodes;
  console.log('SAMPLE(120) gateways:', tally(nodes.flatMap((o: any) => o.paymentGatewayNames)));
  console.log('SAMPLE(120) sources:', tally(nodes.map((o: any) => o.sourceName ?? 'null')));
  console.log('SAMPLE(120) buyer types:', tally(nodes.map((o: any) => o.purchasingEntity?.__typename ?? 'none')));
  console.log('SAMPLE(120) ship countries:', tally(nodes.map((o: any) => o.shippingAddress?.countryCodeV2 ?? 'none')));
  console.log('SAMPLE(120) tax line counts:', tally(nodes.map((o: any) => String(o.taxLines.length))));
  const multiTax = nodes.filter((o: any) => o.taxLines.length > 1).slice(0, 5);
  for (const o of multiTax) {
    console.log('MULTI-TAX EXAMPLE:', o.name, JSON.stringify(o.taxLines));
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
