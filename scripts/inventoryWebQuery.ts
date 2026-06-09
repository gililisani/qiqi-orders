#!/usr/bin/env tsx
/**
 * Inventory — NetSuite Web Query feed check (read-only).
 *
 * Fetches the "Qiqi ALL Stock Matrix" via the Allow-Web-Query URL and prints a
 * summary + the current negatives. Use this to confirm NETSUITE_WEBQUERY_URL is
 * valid and the report's "As of" is tracking today.
 *
 * Run:
 *   npm run inv:webquery
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import { fetchStockMatrix } from '../lib/inventory/webQuery';

async function main() {
  const rows = await fetchStockMatrix();
  const items = new Set(rows.map((r) => r.itemCode));
  const locations = new Set(rows.map((r) => r.location));
  const negatives = rows.filter((r) => r.qoh < 0).sort((a, b) => a.qoh - b.qoh);

  console.log(`Rows:       ${rows.length}`);
  console.log(`Items:      ${items.size}`);
  console.log(`Locations:  ${locations.size}`);
  console.log(`Negatives:  ${negatives.length}`);
  console.log('');
  console.log('Current negatives (most-negative first):');
  for (const n of negatives) {
    const qty = n.qoh.toLocaleString();
    console.log(`  ${n.itemCode.padEnd(10)} ${qty.padStart(10)}  ${n.location}`);
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
