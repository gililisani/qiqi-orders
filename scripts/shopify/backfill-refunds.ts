/**
 * Loop C backfill (SANDBOX): credit memos + customer refunds for synced
 * orders in a date range that carry Shopify refunds.
 *
 *   npx tsx scripts/shopify/backfill-refunds.ts --from 2026-07-28 --to 2026-07-28
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { shopifyPaginate } from '../../lib/shopify/client';
import { ORDER_SELECTION } from '../../lib/shopify/orderQuery';
import { buildOrderPlan } from '../../lib/shopify/core/orderTransform';
import { buildRefundPlans } from '../../lib/shopify/core/refundTransform';
import type { ShopifyOrder } from '../../lib/shopify/core/types';
import { ensureRefunds } from '../../lib/shopify/engine/refund';
import { PipelineError } from '../../lib/shopify/engine/pipeline';
import { ENGINE_CONFIG } from '../../lib/shopify/engine/config';
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}

async function main() {
  const from = arg('from');
  const to = arg('to');
  if (!from || !to) throw new Error('Usage: backfill-refunds.ts --from YYYY-MM-DD --to YYYY-MM-DD');

  const orders = await shopifyPaginate<ShopifyOrder>(
    `query BR($q: String!, $cursor: String) {
      orders(first: 25, after: $cursor, sortKey: CREATED_AT, query: $q) {
        nodes { ${ORDER_SELECTION} }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { q: `created_at:>='${from}' created_at:<='${to}T23:59:59Z'` },
    'orders',
  );
  const withRefunds = orders.filter((o) => o.refunds.length > 0);
  console.log(`${orders.length} orders in range, ${withRefunds.length} with refunds`);
  const ns = createNetSuiteForTarget('sandbox');
  let ok = 0, notSynced = 0, errored = 0;

  for (const order of withRefunds) {
    const sid = order.id.replace(/^.*\//, '');
    const custId = await ns.findRecordIdByExternalId('customer', `SHOP-${order.purchasingEntity?.__typename === 'PurchasingCompany' ? 'CO-' + (order.purchasingEntity as any).company.id.replace(/^.*\//, '') : 'CUST-' + (order.customer?.id ?? '').replace(/^.*\//, '')}`);
    const invId = await ns.findRecordIdByExternalId('invoice', `SHOPINV-${sid}`);
    if (!custId || !invId) {
      notSynced += 1;
      console.log(`  - ${order.name}: order not synced yet (run backfill.ts first)`);
      continue;
    }
    const { plans, issues } = buildRefundPlans(order);
    if (issues.length) {
      errored += 1;
      console.log(`  ✗ ${order.name}: transform issues: ${issues.map((i) => i.code).join(',')}`);
      continue;
    }
    try {
      const orderPlan = buildOrderPlan(order);
      const hasIf = (await ns.suiteQL<{ n: string }>(
        `SELECT COUNT(*) AS n FROM transaction WHERE type = 'ItemShip' AND custbody_shopify_order_id = ${Number(sid)}`,
      ))[0]?.n !== '0';
      const r = await ensureRefunds(plans, orderPlan, custId, ns, ENGINE_CONFIG, { orderHasNsFulfillment: hasIf });
      ok += 1;
      console.log(
        `  ✓ ${order.name}: CM=${r.nsCreditMemoIds.join(',')} (${r.created.creditMemos} new) refund=${r.nsRefundIds.join(',')} (${r.created.refunds} new)`,
      );
    } catch (err: any) {
      errored += 1;
      const msg = err instanceof PipelineError ? `${err.issue.code}: ${err.issue.message}` : String(err?.message ?? err);
      console.log(`  ✗ ${order.name}: ${msg.slice(0, 250)}`);
    }
  }
  console.log(`\nDONE: ${ok} ok, ${notSynced} not-synced, ${errored} errored of ${withRefunds.length} refunded orders`);
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
