#!/usr/bin/env tsx
/**
 * Inventory Investigation — NetSuite PROBE (Phase 1, read-only).
 *
 * PURPOSE: dump RAW NetSuite rows so a human can inspect the real shape of the
 * data BEFORE we finalize the parser. This script intentionally does NOT
 * normalize, pair transfers, or compute balances — that comes after we've
 * eyeballed the output and confirmed the verification targets below.
 *
 * Run:
 *   npx tsx scripts/inventoryProbe.ts                # COM0059 + BAS0009
 *   npx tsx scripts/inventoryProbe.ts COM0067        # any item code(s)
 *
 * Output: writes ./tmp/probe-<ITEM>.json (machine) and ./tmp/probe-<ITEM>.txt
 * (human-readable) per item, plus ./tmp/probe-transfer-dump.json (all columns
 * of one Inventory Transfer's lines, for transfer-schema discovery).
 *
 * VERIFICATION TARGETS (do not finalize the parser until these check out):
 *   - Bill SWC013356 reduced COM0059 by 10,000 at Critzas on 2024-04-23 (VendBill).
 *   - IT10205 (Inventory Transfer, BAS0009, 2024-09-25) must come back as TWO
 *     rows: negative qty @ Critzas + positive qty @ ProPack, same transaction id
 *     and tranid. If only one leg returns, the query is wrong — debug before parsing.
 *   - BAS0009 same-day round-trip: IT10205 + IR10460 on 2024-09-25 @ Critzas.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

// NetSuite creds live in .env.local (Next.js convention); fall back to .env.
loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import { createNetSuiteAPI } from '../lib/netsuite';

const TMP_DIR = resolve(process.cwd(), 'tmp');

// Inventory-affecting transaction types. VendBill included — confirmed used in
// this account (Bill SWC013356 reduced COM0059 at Critzas).
const TX_TYPES = [
  'ItemRcpt',   // Item Receipt (IR)
  'ItemShip',   // Item Fulfillment (IF)
  'InvTrnfr',   // Inventory Transfer (IT) — two legs
  'Build',      // Assembly Build
  'Unbuild',    // Assembly Unbuild
  'InvAdjst',   // Inventory Adjustment
  'VendBill',   // Vendor Bill that posts inventory
] as const;

const sql = (s: string) => s.replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/'/g, "''");

async function probeItem(ns: ReturnType<typeof createNetSuiteAPI>, itemCode: string) {
  const out: Record<string, unknown> = { itemCode, generatedAtNote: 'raw NS rows, unparsed' };

  // --- 1. Resolve the item: internal id, type, name ------------------------
  const itemRows = await ns.suiteQL<Record<string, unknown>>(
    sql(`SELECT id, itemid, BUILTIN.DF(itemtype) AS itemtype_name, itemtype, displayname, description
           FROM item
          WHERE UPPER(itemid) = '${esc(itemCode.toUpperCase())}'`),
  );
  out.item = itemRows;
  if (itemRows.length === 0) {
    out.error = `No item found with itemid = ${itemCode}`;
    return out;
  }
  const nsItemId = String((itemRows[0] as any).id);
  out.nsItemId = nsItemId;

  // --- 2. Candidate inventory-line pull (the query we'll base the parser on) -
  // Pull every transactionline for this item across the inventory-affecting
  // types. We select a generous set of CANDIDATE fields so the raw output
  // reveals which ones carry the signed quantity / location / transfer info.
  const typeList = TX_TYPES.map((t) => `'${t}'`).join(', ');
  const lineRows = await ns.suiteQL<Record<string, unknown>>(
    sql(`SELECT  t.id              AS tx_id,
                 t.tranid          AS doc_number,
                 t.trandate        AS tran_date,
                 t.type            AS ns_type,
                 BUILTIN.DF(t.type) AS ns_type_name,
                 t.createddate     AS created_date,
                 t.memo            AS tx_memo,
                 tl.id             AS line_id,
                 tl.linesequencenumber AS line_seq,
                 tl.item           AS item_id,
                 tl.location       AS location_id,
                 BUILTIN.DF(tl.location) AS location_name,
                 tl.quantity       AS quantity,
                 tl.mainline       AS mainline,
                 tl.memo           AS line_memo
            FROM transactionline tl
            JOIN transaction t ON t.id = tl.transaction
           WHERE tl.item = ${nsItemId}
             AND t.type IN (${typeList})
           ORDER BY t.trandate, t.id, tl.id`),
  );
  out.lineRows = lineRows;
  out.lineRowCount = lineRows.length;
  out.truncationWarning =
    lineRows.length >= 1000
      ? 'WARNING: hit the 1000-row SuiteQL default limit — pull is TRUNCATED. The real parser must paginate.'
      : null;

  // --- 3. Current quantity-on-hand per location (ground-truth anchor) -------
  const qohRows = await ns.suiteQL<Record<string, unknown>>(
    sql(`SELECT il.location              AS location_id,
                BUILTIN.DF(il.location)  AS location_name,
                SUM(il.quantityonhand)   AS qoh
           FROM inventorybalance il
          WHERE il.item = ${nsItemId}
          GROUP BY il.location, BUILTIN.DF(il.location)`),
  );
  out.currentQoh = qohRows;

  // --- 4. Diagnostics: distinct types, distinct locations -------------------
  const typeCounts: Record<string, number> = {};
  const locSet = new Set<string>();
  for (const r of lineRows as any[]) {
    typeCounts[r.ns_type] = (typeCounts[r.ns_type] ?? 0) + 1;
    locSet.add(`${r.location_id} (${r.location_name ?? '?'})`);
  }
  out.diagnostics = {
    typeCounts,
    locations: [...locSet].sort(),
  };

  // --- 5. Highlight verification targets ------------------------------------
  out.verificationTargets = {
    'SWC013356_VendBill': (lineRows as any[]).filter((r) => r.doc_number === 'SWC013356'),
    'IT10205_transfer_legs': (lineRows as any[]).filter((r) => r.doc_number === 'IT10205'),
    'IR10460_receipt': (lineRows as any[]).filter((r) => r.doc_number === 'IR10460'),
  };

  return out;
}

/** Dump ALL columns of one Inventory Transfer's lines, to discover the
 *  transfer-destination schema (does a transfer = 2 rows, or 1 row + a
 *  to-location column?). Uses SELECT * on a single known IT document. */
async function probeTransferSchema(ns: ReturnType<typeof createNetSuiteAPI>, docNumber: string) {
  const txRows = await ns.suiteQL<Record<string, unknown>>(
    sql(`SELECT id, tranid, type, trandate FROM transaction
          WHERE UPPER(tranid) = '${esc(docNumber.toUpperCase())}'`),
  );
  if (txRows.length === 0) return { docNumber, error: 'transfer doc not found' };
  const txId = String((txRows[0] as any).id);

  // SELECT * to reveal every available column on the transfer's lines.
  let allLineCols: unknown;
  try {
    allLineCols = await ns.suiteQL<Record<string, unknown>>(
      sql(`SELECT * FROM transactionline WHERE transaction = ${txId} ORDER BY id`),
    );
  } catch (e: any) {
    allLineCols = { error: `SELECT * failed: ${e?.message}` };
  }
  return { docNumber, txId, header: txRows[0], lines: allLineCols };
}

async function main() {
  const items = process.argv.slice(2);
  const targets = items.length > 0 ? items : ['COM0059', 'BAS0009'];

  mkdirSync(TMP_DIR, { recursive: true });
  const ns = createNetSuiteAPI();

  // NOTE: we don't use ns.testConnection() here — it issues `LIMIT 1`, which
  // NetSuite SuiteQL rejects (it requires FETCH FIRST n ROWS ONLY), so it
  // returns a false negative. Do our own connectivity check instead.
  console.log(`[probe] connecting to NetSuite…`);
  try {
    await ns.suiteQL('SELECT id FROM subsidiary FETCH FIRST 1 ROWS ONLY');
    console.log(`[probe] connection: OK`);
  } catch (e: any) {
    console.error(`[probe] NetSuite connection FAILED: ${e?.message ?? e}`);
    process.exit(1);
  }

  for (const code of targets) {
    console.log(`\n[probe] === ${code} ===`);
    const result = await probeItem(ns, code);
    const jsonPath = resolve(TMP_DIR, `probe-${code}.json`);
    writeFileSync(jsonPath, JSON.stringify(result, null, 2));

    // Human-readable summary
    const lines: string[] = [];
    lines.push(`PROBE: ${code}`);
    lines.push(`item: ${JSON.stringify((result as any).item)}`);
    lines.push(`nsItemId: ${(result as any).nsItemId}`);
    lines.push(`lineRowCount: ${(result as any).lineRowCount}`);
    if ((result as any).truncationWarning) lines.push((result as any).truncationWarning);
    lines.push(`typeCounts: ${JSON.stringify((result as any).diagnostics?.typeCounts)}`);
    lines.push(`locations: ${JSON.stringify((result as any).diagnostics?.locations, null, 2)}`);
    lines.push(`currentQoh: ${JSON.stringify((result as any).currentQoh, null, 2)}`);
    lines.push(`\n--- verification targets ---`);
    lines.push(JSON.stringify((result as any).verificationTargets, null, 2));
    lines.push(`\n--- first 25 raw line rows ---`);
    lines.push(JSON.stringify(((result as any).lineRows ?? []).slice(0, 25), null, 2));
    const txtPath = resolve(TMP_DIR, `probe-${code}.txt`);
    writeFileSync(txtPath, lines.join('\n'));

    console.log(`[probe] wrote ${jsonPath}`);
    console.log(`[probe] wrote ${txtPath}`);
    console.log(`[probe]   rows=${(result as any).lineRowCount} types=${JSON.stringify((result as any).diagnostics?.typeCounts)}`);
  }

  // Transfer-schema discovery on the known IT.
  console.log(`\n[probe] === transfer schema discovery (IT10205) ===`);
  const transfer = await probeTransferSchema(ns, 'IT10205');
  const tPath = resolve(TMP_DIR, 'probe-transfer-dump.json');
  writeFileSync(tPath, JSON.stringify(transfer, null, 2));
  console.log(`[probe] wrote ${tPath}`);

  console.log(`\n[probe] DONE. Inspect the files in ./tmp/ and share them back before parser work.`);
}

main().catch((e) => {
  console.error('[probe] FATAL:', e?.message ?? e);
  process.exit(1);
});
