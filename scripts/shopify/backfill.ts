/**
 * Manual backfill runner — "bring all sales from X to Y into NetSuite".
 * Default target is SANDBOX (Loop A only). Production is opt-in for the
 * cutover gap import (runbook step 4) and requires BOTH flags:
 *
 *   --target production --i-am-sure   → full chain (A+B+C) per order,
 *                                       exactly what the live poller runs.
 *
 *   npx tsx scripts/shopify/backfill.ts --from 2026-07-01 --to 2026-07-05 --dry-run
 *   npx tsx scripts/shopify/backfill.ts --from 2026-07-01 --to 2026-07-05
 *   npx tsx scripts/shopify/backfill.ts --from 2026-08-25 --to 2026-08-25 --target production --i-am-sure
 *
 * Idempotent: externalid namespaces (SHOPORD-/SHOPINV-/SHOPPAY-/SHOP-*)
 * make re-runs adopt instead of duplicate — run the same range twice and
 * the second run reports 0 creates.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { shopifyPaginate } from '../../lib/shopify/client';
import { ORDER_SELECTION } from '../../lib/shopify/orderQuery';
import { gateOrder } from '../../lib/shopify/core/validate';
import { buildOrderPlan } from '../../lib/shopify/core/orderTransform';
import type { ShopifyOrder } from '../../lib/shopify/core/types';
import { runOrderPipeline, PipelineError } from '../../lib/shopify/engine/pipeline';
import { executeOrder } from '../../lib/shopify/engine/execute';
import { engineConfigForTarget } from '../../lib/shopify/engine/config';
import { createNetSuiteForTarget, type NsTarget } from '../../lib/shopify/engine/nsTarget';
import { ShopifySyncStore } from '../../lib/shopify/store';

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
  if (!from || !to) throw new Error('Usage: backfill.ts --from YYYY-MM-DD --to YYYY-MM-DD [--dry-run] [--limit N] [--target production --i-am-sure]');

  const target: NsTarget = arg('target') === 'production' ? 'production' : 'sandbox';
  if (target === 'production' && !has('i-am-sure')) {
    throw new Error('--target production writes to the PRODUCTION ledger — add --i-am-sure to confirm');
  }
  const config = engineConfigForTarget(target); // throws while prod config carries PROD-PENDING ids

  // Production runs persist to the prod HUB Supabase (dashboard visibility,
  // SKU aliases, NetScore stamp snapshot) and execute the FULL chain.
  const store =
    target === 'production'
      ? new ShopifySyncStore(
          createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
            auth: { persistSession: false },
          }),
        )
      : null;

  console.log(
    `Backfill ${from} → ${to} (${dryRun ? 'DRY RUN — no NS writes' : `writing to NS ${target.toUpperCase()}`})`,
  );

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

  const ns = createNetSuiteForTarget(target);
  const knownSkus = new Set(
    (await ns.suiteQLPaged<{ itemid: string }>(`SELECT itemid FROM item WHERE isinactive = 'F'`)).map((r) => r.itemid),
  );
  const aliases = store ? await store.getSkuAliases() : new Map<string, string>();
  for (const sku of aliases.keys()) knownSkus.add(sku);
  console.log(`${target} item universe: ${knownSkus.size} SKUs (${aliases.size} aliases)`);

  const report: any[] = [];
  let ok = 0,
    skipped = 0,
    errored = 0;

  for (const order of slice) {
    const shopifyOrderId = order.id.replace(/^.*\//, '');
    const gate = gateOrder(order, knownSkus);
    if (gate.outcome === 'skip') {
      skipped += 1;
      report.push({ order: order.name, result: 'skip', reason: gate.reason });
      if (store && !dryRun) {
        await store.seenOrder(order, null);
        await store.markSkipped(shopifyOrderId, gate.reason, gate.message).catch(() => {});
      }
      continue;
    }
    if (gate.outcome === 'error') {
      errored += 1;
      report.push({ order: order.name, result: 'gate_error', issues: gate.issues.map((i) => i.message) });
      console.log(`  ✗ ${order.name} GATE: ${gate.issues.map((i) => i.code).join(',')}`);
      if (store && !dryRun) {
        await store.seenOrder(order, null);
        await store.markError(shopifyOrderId, gate.issues).catch(() => {});
      }
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
      if (target === 'production') {
        // Cutover guard: orders NetScore already booked stay theirs.
        if (await store!.hasNetscoreSalesOrder(shopifyOrderId)) {
          skipped += 1;
          report.push({ order: order.name, result: 'skip', reason: 'NETSCORE_ERA' });
          await store!.seenOrder(order, null);
          await store!
            .markSkipped(shopifyOrderId, 'NETSCORE_ERA', `${order.name} was booked by NetScore — chain exists`)
            .catch(() => {});
          continue;
        }
        // Full chain (A+B+C) + prod dashboard persistence — same as the
        // live poller, so gap-imported orders look identical to polled ones.
        await store!.seenOrder(order, plan);
        const outcome = await executeOrder(order, plan, ns, config, {
          skuOverrides: aliases,
          stampCandidates: (sid) => store!.stampCandidates(sid, target),
        });
        await store!.setState(shopifyOrderId, outcome.state, {
          ...outcome.nsIds,
          ns_target: target,
          error_code: null,
          error_message: null,
          skip_reason: null,
        });
        await store!.event('orders', 'backfilled', shopifyOrderId, { state: outcome.state });
        ok += 1;
        console.log(`  ✓ ${order.name} state=${outcome.state} so=${outcome.nsIds.ns_so_id} inv=${outcome.nsIds.ns_invoice_id}`);
        report.push({ order: order.name, result: 'synced', ...outcome });
      } else {
        const r = await runOrderPipeline(plan, ns, config);
        ok += 1;
        const c = r.created;
        console.log(
          `  ✓ ${order.name} customer=${r.nsCustomerId}(${r.customerVia}${c.customer ? ',new' : ''}) ` +
            `so=${r.nsSoId}${c.so ? '(new)' : ''} inv=${r.nsInvoiceId}${c.invoice ? '(new)' : ''} payments=${r.nsPaymentIds.length}(${c.payments} new)`,
        );
        report.push({ order: order.name, result: 'synced', ...r });
      }
    } catch (err: any) {
      errored += 1;
      const msg = err instanceof PipelineError ? `${err.issue.code}: ${err.issue.message}` : String(err?.message ?? err);
      console.log(`  ✗ ${order.name} ${msg.slice(0, 200)}`);
      report.push({ order: order.name, result: 'error', error: msg.slice(0, 500) });
      if (target === 'production' && store) {
        const issue =
          err instanceof PipelineError
            ? err.issue
            : { code: 'UNSUPPORTED_SOURCE' as const, message: String(err?.message ?? err).slice(0, 500) };
        await store.markError(shopifyOrderId, [issue]).catch(() => {});
      }
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
