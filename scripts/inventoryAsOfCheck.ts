#!/usr/bin/env tsx
/**
 * Validate the as-of-date inventory RESTlet after you deploy it.
 *
 *   npx tsx scripts/inventoryAsOfCheck.ts 2024-09-30 FPS0017
 *
 * Prints NetSuite's measured on-hand per location as of the date. Use the known
 * anchor: FPS0017 @ Packable - Qiqi INC should be 5 on 2024-09-30.
 * Requires NETSUITE_ASOF_SCRIPT_ID / _DEPLOY_ID in .env.local.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '.env.local') });
import { createNetSuiteAPI } from '../lib/netsuite';

async function main() {
  const date = process.argv[2] || '2024-09-30';
  const item = process.argv[3]; // optional SKU
  const ns = createNetSuiteAPI();
  if (!ns.isAsOfConfigured()) {
    console.error('RESTlet not configured. Set NETSUITE_ASOF_SCRIPT_ID and NETSUITE_ASOF_DEPLOY_ID in .env.local.');
    process.exit(1);
  }
  console.log(`[as-of] calling RESTlet for date=${date}${item ? ` item=${item}` : ''}…`);
  const res = await ns.getInventoryAsOf(date, item ? { itemCode: item } : undefined);
  console.log(`[as-of] asOfDate=${res.asOfDate} rows=${res.rows.length}`);
  for (const r of res.rows.slice(0, 60)) {
    console.log(`  ${r.itemCode} @ ${r.locationName}: ${r.qty}`);
  }
  if (item) {
    const total = res.rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
    console.log(`\n[as-of] ${item} total across locations on ${date}: ${total}`);
  }
}
main().catch((e) => {
  console.error('[as-of] FATAL:', e?.message ?? e);
  process.exit(1);
});
