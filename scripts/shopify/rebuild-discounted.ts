/**
 * SANDBOX sweep: rebuild every synced order in the given ranges that
 * carries a discount (old representation hid discounts from 420000).
 *
 *   npx tsx scripts/shopify/rebuild-discounted.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { shopifyPaginate } from '../../lib/shopify/client';
import { ORDER_SELECTION } from '../../lib/shopify/orderQuery';
import { gateOrder } from '../../lib/shopify/core/validate';
import { buildOrderPlan } from '../../lib/shopify/core/orderTransform';
import { executeOrder } from '../../lib/shopify/engine/execute';
import { ENGINE_CONFIG } from '../../lib/shopify/engine/config';
import { loadKnownSkus } from '../../lib/shopify/engine/deps';
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';
import type { ShopifyOrder } from '../../lib/shopify/core/types';

const RANGES: Array<[string, string]> = [
  ['2026-07-28', '2026-07-28'],
  ['2026-08-10', '2026-08-12'],
  ['2026-08-16', '2026-08-19'],
];

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const knownSkus = await loadKnownSkus();
  let rebuilt = 0, skippedNoDiscount = 0, notSynced = 0, failed = 0;

  for (const [from, to] of RANGES) {
    const orders = await shopifyPaginate<ShopifyOrder>(
      `query RB($q: String!, $cursor: String) {
        orders(first: 25, after: $cursor, sortKey: CREATED_AT, query: $q) {
          nodes { ${ORDER_SELECTION} }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { q: `created_at:>='${from}' created_at:<='${to}T23:59:59Z'` },
      'orders',
    );
    for (const order of orders) {
      const hasDiscount = order.lineItems.nodes.some((l) => l.discountAllocations.length > 0);
      if (!hasDiscount) { skippedNoDiscount++; continue; }
      const sid = order.id.replace(/^.*\//, '');
      const soId = await ns.findRecordIdByExternalId('salesOrder', `SHOPORD-${sid}`);
      if (!soId) { notSynced++; continue; }
      const gate = gateOrder(order, knownSkus);
      if (gate.outcome !== 'proceed') { notSynced++; continue; }

      try {
        const del = async (type: string, extId: string) => {
          const id = await ns.findRecordIdByExternalId(type, extId);
          if (id) await ns.deleteRecord(type, id);
        };
        for (const t of order.transactions) await del('customerpayment', `SHOPPAY-${t.id.replace(/^.*\//, '')}`);
        for (const r of order.refunds) {
          for (const t of r.transactions.nodes) await del('customerrefund', `SHOPRFD-${t.id.replace(/^.*\//, '')}`);
          await del('creditMemo', `SHOPCM-${r.id.replace(/^.*\//, '')}`);
        }
        for (const f of order.fulfillments) await del('itemFulfillment', `SHOPFUL-${f.id.replace(/^.*\//, '')}`);
        await del('invoice', `SHOPINV-${sid}`);
        await del('salesOrder', `SHOPORD-${sid}`);

        const plan = buildOrderPlan(order);
        const r = await executeOrder(order, plan, ns, ENGINE_CONFIG);
        rebuilt++;
        const disc = plan.lines.reduce((s, l) => s + l.discountCents, 0);
        console.log(`  ✓ ${order.name} rebuilt (discount $${(disc / 100).toFixed(2)}) → so=${r.nsIds.ns_so_id} inv=${r.nsIds.ns_invoice_id}`);
      } catch (e: any) {
        failed++;
        console.log(`  ✗ ${order.name}: ${String(e?.message).slice(0, 180)}`);
      }
    }
  }
  console.log(`\nDONE: ${rebuilt} rebuilt, ${skippedNoDiscount} no-discount (untouched), ${notSynced} not-synced/gated, ${failed} failed`);
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
