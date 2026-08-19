/**
 * Loop B backfill (SANDBOX): create Item Fulfillments for already-synced
 * orders in a date range whose Shopify fulfillments are SUCCESS.
 *
 *   npx tsx scripts/shopify/backfill-fulfillments.ts --from 2026-08-10 --to 2026-08-12
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { shopifyPaginate } from '../../lib/shopify/client';
import { ORDER_SELECTION } from '../../lib/shopify/orderQuery';
import { buildFulfillmentPlans } from '../../lib/shopify/core/fulfillmentTransform';
import type { ShopifyOrder } from '../../lib/shopify/core/types';
import { ensureItemFulfillments } from '../../lib/shopify/engine/fulfill';
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
  if (!from || !to) throw new Error('Usage: backfill-fulfillments.ts --from YYYY-MM-DD --to YYYY-MM-DD');

  const orders = await shopifyPaginate<ShopifyOrder>(
    `query BF($q: String!, $cursor: String) {
      orders(first: 25, after: $cursor, sortKey: CREATED_AT, query: $q) {
        nodes { ${ORDER_SELECTION} }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { q: `created_at:>='${from}' created_at:<='${to}T23:59:59Z'` },
    'orders',
  );
  const ns = createNetSuiteForTarget('sandbox');
  let ok = 0, none = 0, notSynced = 0, errored = 0;

  for (const order of orders) {
    const plans = buildFulfillmentPlans(order);
    if (plans.length === 0) {
      none += 1;
      continue;
    }
    const soId = await ns.findRecordIdByExternalId('salesOrder', `SHOPORD-${order.id.replace(/^.*\//, '')}`);
    if (!soId) {
      notSynced += 1;
      console.log(`  - ${order.name}: SO not in sandbox (skipping)`);
      continue;
    }
    try {
      const r = await ensureItemFulfillments(plans, soId, ns, ENGINE_CONFIG);
      ok += 1;
      console.log(`  ✓ ${order.name}: ${r.nsFulfillmentIds.length} IF(s) (${r.created} new) — ${r.nsFulfillmentIds.join(',')}`);
    } catch (err: any) {
      errored += 1;
      const msg = err instanceof PipelineError ? `${err.issue.code}: ${err.issue.message}` : String(err?.message ?? err);
      console.log(`  ✗ ${order.name}: ${msg.slice(0, 220)}`);
    }
  }
  console.log(`\nDONE: ${ok} fulfilled, ${none} no-fulfillment-yet, ${notSynced} not-synced, ${errored} errored of ${orders.length}`);
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
