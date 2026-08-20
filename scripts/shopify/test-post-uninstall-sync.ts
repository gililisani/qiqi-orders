// The decisive test: sync the newest order in a sandbox with NO NetScore
// bundle. Persistent staging store (snapshot rung included).
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';
import { ShopifySyncStore } from '../../lib/shopify/store';
import { shopifyGraphQL } from '../../lib/shopify/client';
import { ORDER_SELECTION } from '../../lib/shopify/orderQuery';
import { retryOrder } from '../../lib/shopify/engine/retryOrder';
import type { ShopifyOrder } from '../../lib/shopify/core/types';

async function main() {
  const db = createClient(process.env.STAGING_SUPABASE_URL!, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const store = new ShopifySyncStore(db);
  const data = await shopifyGraphQL(
    `{ orders(first: 5, reverse: true, sortKey: CREATED_AT) { nodes { ${ORDER_SELECTION} } } }`,
  );
  const order = (data.orders.nodes as ShopifyOrder[]).find((o) => ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(o.displayFinancialStatus));
  if (!order) throw new Error('no recent paid order');
  console.log(`syncing ${order.name} (${order.currentTotalPriceSet.shopMoney.amount}) into bundle-less sandbox…`);
  console.log(JSON.stringify(await retryOrder(order, store), null, 1));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
