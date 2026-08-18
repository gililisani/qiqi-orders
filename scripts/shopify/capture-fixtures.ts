/**
 * Capture real orders (full detail) as JSON fixtures for transform
 * development and tests. Read-only. Fixtures contain real customer PII —
 * the output directory is gitignored; committed test fixtures must be
 * redacted copies.
 *
 *   npx tsx scripts/shopify/capture-fixtures.ts
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { ORDER_SELECTION } from '../../lib/shopify/orderQuery';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
const API_VERSION = '2026-07';
const OUT_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'shopify', 'raw');

async function gql(query: string, variables?: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://${DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (!res.ok || data.errors) {
    throw new Error(`GraphQL (HTTP ${res.status}): ${JSON.stringify(data.errors ?? data).slice(0, 800)}`);
  }
  return data.data;
}

// Canonical selection lives in lib/shopify/orderQuery.ts — one source of truth.
const ORDER_DETAIL = ORDER_SELECTION;

const ARCHETYPES: Array<{ file: string; query: string }> = [
  { file: 'b2b-latest', query: "" }, // filled below from purchasingEntity filtering
  { file: 'b2c-latest', query: "" },
  { file: 'multi-tax-domestic', query: "name:#7201" },
  { file: 'intl-vat-nl', query: "name:#6582" },
  { file: 'intl-de', query: "shipping_address_country_code:DE" },
  { file: 'intl-ca', query: "shipping_address_country_code:CA" },
  { file: 'refunded-full', query: "financial_status:refunded" },
  { file: 'refunded-partial', query: "financial_status:partially_refunded" },
  { file: 'draft-order-sourced', query: "source_name:shopify_draft_order" },
  { file: 'gateway-paypal', query: "gateway:paypal" },
  { file: 'gateway-affirm', query: "gateway:Affirm" },
  { file: 'gateway-shop-cash', query: "gateway:shop_cash" },
  { file: 'pos', query: "source_name:pos" },
  { file: 'discounted', query: "discount_code:*" },
];

async function fetchByQuery(q: string, n = 1): Promise<any[]> {
  const d = await gql(
    `query ($q: String!, $n: Int!) { orders(first: $n, reverse: true, sortKey: CREATED_AT, query: $q) { nodes { ${ORDER_DETAIL} } } }`,
    { q, n },
  );
  return d.orders.nodes;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Keep raw fixtures out of git (real PII).
  const gi = path.join(path.dirname(OUT_DIR), '.gitignore');
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, 'raw/\n');

  // Latest orders split by buyer type (no direct search filter for it).
  const recent = await gql(
    `{ orders(first: 30, reverse: true, sortKey: CREATED_AT) { nodes { ${ORDER_DETAIL} } } }`,
  );
  const b2b = recent.orders.nodes.find((o: any) => o.purchasingEntity?.__typename === 'PurchasingCompany');
  const b2c = recent.orders.nodes.find((o: any) => o.purchasingEntity?.__typename === 'Customer');
  const captured: Record<string, string> = {};
  if (b2b) { fs.writeFileSync(path.join(OUT_DIR, 'b2b-latest.json'), JSON.stringify(b2b, null, 2)); captured['b2b-latest'] = b2b.name; }
  if (b2c) { fs.writeFileSync(path.join(OUT_DIR, 'b2c-latest.json'), JSON.stringify(b2c, null, 2)); captured['b2c-latest'] = b2c.name; }

  for (const a of ARCHETYPES) {
    if (!a.query) continue;
    try {
      const nodes = await fetchByQuery(a.query, 1);
      if (nodes.length === 0) {
        console.log(`MISS  ${a.file}  (no order matches: ${a.query})`);
        continue;
      }
      fs.writeFileSync(path.join(OUT_DIR, `${a.file}.json`), JSON.stringify(nodes[0], null, 2));
      captured[a.file] = nodes[0].name;
    } catch (err: any) {
      console.log(`FAIL  ${a.file}  ${String(err?.message).slice(0, 200)}`);
    }
  }

  console.log('CAPTURED:', JSON.stringify(captured, null, 2));
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
