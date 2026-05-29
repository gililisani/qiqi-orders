#!/usr/bin/env tsx
/**
 * Inventory worklist — recompute / validate.
 *
 *   npm run inv:worklist                 # full catalog recompute + write to Supabase
 *   npx tsx scripts/inventoryWorklist.ts COM0046 COM0067   # per-item, print only (no write)
 *
 * The full mode is the same computation as the "Recompute worklist" button, run
 * locally so it isn't bound by the serverless time limit. The per-item mode is
 * for validating recommendations against known cases without touching the cache.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import { pullItemInventory } from '../lib/inventory/netsuitePull';
import { computeWorklistForItem, validateWorklist, NS_TYPE_LABEL } from '../lib/inventory/worklist';
// NOTE: worklistPull/worklistCache are imported lazily inside the full-recompute
// branch — they pull in the Supabase service-role client, which needs server env
// vars that the per-item validation mode shouldn't require.

async function printItems(codes: string[]) {
  for (const code of codes) {
    console.log(`\n${'='.repeat(72)}\n${code}`);
    const pulled = await pullItemInventory(code);
    const rows = computeWorklistForItem(
      { itemCode: pulled.itemCode, nsItemId: pulled.nsItemId, itemName: pulled.itemName },
      pulled.transactions,
      pulled.openings,
    );
    if (!rows.length) {
      console.log('  no negative locations — nothing to recommend');
      continue;
    }
    for (const r of rows.sort((a, b) => a.depth - b.depth)) {
      const target = r.suspectDoc
        ? `${r.suspectDoc} · ${NS_TYPE_LABEL[r.suspectType ?? ''] ?? r.suspectType} · ${r.suspectDate}`
        : '—';
      console.log(
        `  ${r.locationName} [${r.locationNsId}]  depth=${r.depth}  since=${r.since}\n` +
          `    ${r.category}  ${r.recommendedAction}  edit: ${target}  ${r.changeFrom ?? ''} → ${r.changeTo ?? ''}\n` +
          `    ${r.notes}`,
      );
    }
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--all');
  if (args.length > 0) {
    await printItems(args);
    return;
  }

  const { computeCatalogWorklist } = await import('../lib/inventory/worklistPull');
  const { writeWorklist } = await import('../lib/inventory/worklistCache');

  console.log('[worklist] computing catalog-wide worklist from NetSuite…');
  const started = Date.now();
  const comp = await computeCatalogWorklist();
  const durationMs = Date.now() - started;

  const byCat: Record<string, number> = {};
  for (const r of comp.rows) byCat[r.category] = (byCat[r.category] || 0) + 1;
  console.log(
    `[worklist] scanned=${comp.stats.itemsScanned} withLines=${comp.stats.itemsWithLines} cases=${comp.stats.cases} | ${JSON.stringify(byCat)} in ${(durationMs / 1000).toFixed(1)}s`,
  );

  // Hard self-check.
  const { nonEditable, closedPeriod } = validateWorklist(comp.rows);
  console.log(`[worklist] self-check: nonEditable targets=${nonEditable.length}, pre-2024 targets=${closedPeriod.length}`);
  if (nonEditable.length || closedPeriod.length) {
    console.error('[worklist] RULE VIOLATION — refusing to write. Examples:');
    for (const r of [...nonEditable, ...closedPeriod].slice(0, 5))
      console.error(`  ${r.itemCode} ${r.locationName} → ${r.suspectDoc} ${r.suspectType} ${r.suspectDate}`);
    process.exit(1);
  }

  await writeWorklist(comp, durationMs);
  console.log('[worklist] written to Supabase. Open /admin/inventory-investigation.');
  // Show the worst 15 for a quick sanity read.
  for (const r of comp.rows.slice(0, 15)) {
    console.log(`  ${r.itemCode} · ${r.locationName} · ${r.depth} · ${r.category} · ${r.recommendedAction} · ${r.changeFrom ?? ''}→${r.changeTo ?? ''}`);
  }
}

main().catch((e) => {
  console.error('[worklist] FATAL:', e?.message ?? e);
  process.exit(1);
});
