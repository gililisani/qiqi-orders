/**
 * Manual backfill runner — "bring all sales from X to Y into NetSuite".
 * SANDBOX ONLY by design: this script hard-codes the sandbox target; going
 * live happens through the poller + config mode, never through this script.
 *
 *   npx tsx scripts/shopify/backfill.ts --from 2026-07-01 --to 2026-07-05 --dry-run
 *   npx tsx scripts/shopify/backfill.ts --from 2026-07-01 --to 2026-07-05
 *
 * Idempotent: externalid namespaces (SHOPORD-/SHOPINV-/SHOPPAY-/SHOP-*)
 * make re-runs adopt instead of duplicate — run the same range twice and
 * the second run reports 0 creates.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { shopifyPaginate } from '../../lib/shopify/client';
import { ORDER_SELECTION } from '../../lib/shopify/orderQuery';
import { gateOrder } from '../../lib/shopify/core/validate';
import { buildOrderPlan } from '../../lib/shopify/core/orderTransform';
import type { ShopifyOrder } from '../../lib/shopify/core/types';
import { runOrderPipeline, PipelineError } from '../../lib/shopify/engine/pipeline';
import { ENGINE_CONFIG } from '../../lib/shopify/engine/config';
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const from = arg('from');
  const to = arg('to');
  const dryRun = has('dry-run');
  const limit = Number(arg('limit') ?? '0') || null;
  if (!from || !to) throw new Error('Usage: backfill.ts --from YYYY-MM-DD --to YYYY-MM-DD [--dry-run] [--limit N]');

  console.log(`Backfill ${from} → ${to} (${dryRun ? 'DRY RUN — no NS writes' : 'writing to NS SANDBOX'})`);

  const orders = await shopifyPaginate<ShopifyOrder>(
    `query Backfill($q: String!, $cursor: String) {
      orders(first: 25, after: $cursor, sortKey: CREATED_AT, query: $q) {
        nodes { ${ORDER_SELECTION} }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { q: `created_at:>='${from}' created_at:<='${to}T23:59:59Z'` },
    'orders',
  );
  const slice = limit ? orders.slice(0, limit) : orders;
  console.log(`fetched ${orders.length} orders${limit ? `, processing first ${slice.length}` : ''}`);

  const ns = createNetSuiteForTarget('sandbox');
  const knownSkus = new Set(
    (await ns.suiteQLPaged<{ itemid: string }>(`SELECT itemid FROM item WHERE isinactive = 'F'`)).map((r) => r.itemid),
  );
  console.log(`sandbox item universe: ${knownSkus.size} SKUs`);

  const report: any[] = [];
  let ok = 0,
    skipped = 0,
    errored = 0;

  for (const order of slice) {
    const gate = gateOrder(order, knownSkus);
    if (gate.outcome === 'skip') {
      skipped += 1;
      report.push({ order: order.name, result: 'skip', reason: gate.reason });
      continue;
    }
    if (gate.outcome === 'error') {
      errored += 1;
      report.push({ order: order.name, result: 'gate_error', issues: gate.issues.map((i) => i.message) });
      console.log(`  ✗ ${order.name} GATE: ${gate.issues.map((i) => i.code).join(',')}`);
      continue;
    }
    const plan = buildOrderPlan(order);
    if (dryRun) {
      ok += 1;
      report.push({
        order: order.name,
        result: 'would_sync',
        buyer: `${plan.buyer.kind}:${plan.buyer.displayName}`,
        total: plan.totals.totalCents / 100,
        payments: plan.payments.map((p) => `${p.gateway}:${p.amountCents / 100}`),
      });
      continue;
    }
    try {
      const r = await runOrderPipeline(plan, ns, ENGINE_CONFIG);
      ok += 1;
      const c = r.created;
      console.log(
        `  ✓ ${order.name} customer=${r.nsCustomerId}(${r.customerVia}${c.customer ? ',new' : ''}) ` +
          `so=${r.nsSoId}${c.so ? '(new)' : ''} inv=${r.nsInvoiceId}${c.invoice ? '(new)' : ''} payments=${r.nsPaymentIds.length}(${c.payments} new)`,
      );
      report.push({ order: order.name, result: 'synced', ...r });
    } catch (err: any) {
      errored += 1;
      const msg = err instanceof PipelineError ? `${err.issue.code}: ${err.issue.message}` : String(err?.message ?? err);
      console.log(`  ✗ ${order.name} ${msg.slice(0, 200)}`);
      report.push({ order: order.name, result: 'error', error: msg.slice(0, 500) });
    }
  }

  console.log(`\nDONE: ${ok} ok, ${skipped} skipped, ${errored} errored of ${slice.length}`);
  const outPath = path.join(process.cwd(), `backfill-report-${from}-${to}${dryRun ? '-dry' : ''}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`report: ${outPath}`);
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
