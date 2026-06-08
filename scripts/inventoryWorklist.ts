#!/usr/bin/env tsx
/**
 * Inventory worklist — recompute / validate.
 *
 *   npm run inv:worklist                 # full catalog recompute + write to Supabase
 *   npx tsx scripts/inventoryWorklist.ts --dry            # compute + self-check, NO write
 *   npx tsx scripts/inventoryWorklist.ts FPS0021 FPS0016  # compute catalog, print these items only (no write)
 *
 * Chain-aware recommendations require the full catalog context (cross-item
 * component checks), so per-item mode still computes the catalog, then filters.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import { computeCatalogWorklist } from '../lib/inventory/worklistPull';
import { validateWorklist, NS_TYPE_LABEL, type WorklistRow } from '../lib/inventory/worklist';

function printRow(r: WorklistRow) {
  console.log(
    `\n  ${r.itemCode} @ ${r.locationName}  depth=${r.depth}  since=${r.since}  TIER ${r.tier}  [${r.category}] ${r.recommendationType}`,
  );
  console.log(`    prerequisite: ${r.prerequisiteSummary}`);
  if (r.editsRequired.length) {
    console.log('    EDITS REQUIRED:');
    for (const e of r.editsRequired)
      console.log(`      ${e.order}. ${e.manual ? '[NetSuite UI] ' : ''}${e.doc ? e.doc + ' · ' + (NS_TYPE_LABEL[e.docType ?? ''] ?? e.docType) + ' · ' : ''}${e.action}${e.detail ? `  (${e.detail})` : ''}`);
  }
  if (r.options.length) {
    console.log(`    ALTERNATIVES: ${r.options.length}`);
    for (const o of r.options) console.log(`      - [${o.category}] ${o.recommendationType} (${o.edits.length} edits; prereq ${o.prerequisiteSummary})`);
  }
  console.log(`    notes: ${r.notes}`);
}

function selfCheck(rows: WorklistRow[]): boolean {
  const v = validateWorklist(rows);
  console.log(`\n[self-check]`);
  console.log(`  1. non-editable targets        = ${v.nonEditable.length} (must be 0)`);
  console.log(`  2. pre-2024 edit targets       = ${v.closedPeriod.length} (must be 0)`);
  console.log(`  3. pre-2024 prerequisite dates = ${v.prereqPreCutoff.length} (must be 0)`);
  console.log(`  4. incomplete intercompany chains (IF without IR) = ${v.incompleteChain.length} (must be 0)`);
  const bad = v.nonEditable.length + v.closedPeriod.length + v.prereqPreCutoff.length + v.incompleteChain.length;
  if (bad) {
    console.error('  RULE VIOLATION — examples:');
    for (const r of [...v.nonEditable, ...v.closedPeriod, ...v.prereqPreCutoff, ...v.incompleteChain].slice(0, 6))
      console.error(`    ${r.itemCode} @ ${r.locationName} → ${r.recommendationType}; edits=${JSON.stringify(r.editsRequired.map((e) => `${e.docType}:${e.action}`))}`);
  }
  return bad === 0;
}

async function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry');
  const itemFilter = argv.filter((a) => !a.startsWith('--')).map((s) => s.toUpperCase());

  console.log('[worklist] computing catalog-wide worklist from NetSuite…');
  const started = Date.now();
  const comp = await computeCatalogWorklist();
  const durationMs = Date.now() - started;

  const byCat: Record<string, number> = {};
  for (const r of comp.rows) byCat[r.category] = (byCat[r.category] || 0) + 1;
  const byTier: Record<string, number> = {};
  for (const w of comp.windows) byTier[`T${w.tier}`] = (byTier[`T${w.tier}`] || 0) + 1;
  console.log(
    `[worklist] scanned=${comp.stats.itemsScanned} withLines=${comp.stats.itemsWithLines} cases=${comp.stats.cases} windows=${comp.windows.length} chainPairs=${comp.stats.chainPairs} residualItems=${comp.stats.residualItems} | cat=${JSON.stringify(byCat)} tier=${JSON.stringify(byTier)} in ${(durationMs / 1000).toFixed(1)}s`,
  );

  const ok = selfCheck(comp.rows);

  if (itemFilter.length) {
    for (const code of itemFilter) {
      const rows = comp.rows.filter((r) => r.itemCode.toUpperCase() === code);
      console.log(`\n${'='.repeat(72)}\n${code} — ${rows.length} worklist row(s)`);
      for (const r of rows.sort((a, b) => a.depth - b.depth)) printRow(r);
    }
    return;
  }

  if (dry) {
    console.log('\n[worklist] --dry: not writing. Worst 12:');
    for (const r of comp.rows.slice(0, 12)) printRow(r);
    return;
  }

  if (!ok) {
    console.error('[worklist] refusing to write due to self-check failure.');
    process.exit(1);
  }

  const { writeWorklist, writeNegativeWindows } = await import('../lib/inventory/worklistCache');
  await writeWorklist(comp, durationMs);
  await writeNegativeWindows(comp.windows);
  console.log('[worklist] written to Supabase. Open /admin/inventory-investigation.');
}

main().catch((e) => {
  console.error('[worklist] FATAL:', e?.message ?? e);
  process.exit(1);
});
