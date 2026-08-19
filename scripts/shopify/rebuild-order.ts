/**
 * SANDBOX ONLY: delete one synced order's NS chain and re-run it through
 * the current pipeline (for verifying representation changes in QA).
 *
 *   npx tsx scripts/shopify/rebuild-order.ts --order 7516567535671
 *   (numeric Shopify order id; find it via the dashboard or SHOPORD- externalid)
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { shopifyGraphQL } from '../../lib/shopify/client';
import { ORDER_SELECTION } from '../../lib/shopify/orderQuery';
import { gateOrder } from '../../lib/shopify/core/validate';
import { buildOrderPlan } from '../../lib/shopify/core/orderTransform';
import { executeOrder } from '../../lib/shopify/engine/execute';
import { ENGINE_CONFIG } from '../../lib/shopify/engine/config';
import { loadKnownSkus } from '../../lib/shopify/engine/deps';
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';
import type { ShopifyOrder } from '../../lib/shopify/core/types';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const sid = arg('order');
  if (!sid || !/^\d+$/.test(sid)) throw new Error('Usage: rebuild-order.ts --order <numeric shopify order id>');
  const ns = createNetSuiteForTarget('sandbox');

  // Delete in dependency order: payments → refunds/CMs → IFs → invoice → SO.
  const data = await shopifyGraphQL(
    `query One($id: ID!) { order: node(id: $id) { ... on Order { ${ORDER_SELECTION} } } }`,
    { id: `gid://shopify/Order/${sid}` },
  );
  const order = data.order as ShopifyOrder;
  if (!order?.id) throw new Error('order not found in Shopify');

  if (order.refunds.length > 0 && !process.argv.includes('--force')) {
    throw new Error(
      `${order.name} has refunds — NS blocks deleting applied customer refunds, so a full rebuild is not possible. ` +
      `The old chain stays; new representation applies to newly-created records.`,
    );
  }
  const del = async (type: string, extId: string) => {
    const id = await ns.findRecordIdByExternalId(type, extId);
    if (id) {
      await ns.deleteRecord(type, id);
      console.log(`deleted ${type} ${id} (${extId})`);
    }
  };

  for (const t of order.transactions) {
    await del('customerpayment', `SHOPPAY-${t.id.replace(/^.*\//, '')}`);
  }
  for (const r of order.refunds) {
    for (const t of r.transactions.nodes) await del('customerrefund', `SHOPRFD-${t.id.replace(/^.*\//, '')}`);
    await del('creditMemo', `SHOPCM-${r.id.replace(/^.*\//, '')}`);
  }
  for (const f of order.fulfillments) {
    await del('itemFulfillment', `SHOPFUL-${f.id.replace(/^.*\//, '')}`);
  }
  await del('invoice', `SHOPINV-${sid}`);
  await del('salesOrder', `SHOPORD-${sid}`);

  // Re-run through the current pipeline.
  const gate = gateOrder(order, await loadKnownSkus());
  if (gate.outcome !== 'proceed') throw new Error(`gate: ${JSON.stringify(gate)}`);
  const plan = buildOrderPlan(order);
  const r = await executeOrder(order, plan, ns, ENGINE_CONFIG);
  console.log(`rebuilt ${order.name}:`, JSON.stringify(r, null, 1));
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
