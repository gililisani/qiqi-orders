#!/usr/bin/env tsx
/**
 * Inventory reconciliation PROTOTYPE (Phase 1 validation).
 *
 * Tests the parser hypothesis against the known anchors BEFORE we commit it to
 * the real pipeline:
 *   - Inventory-affecting lines = transactionline.isinventoryaffecting = 'T'
 *     (no transaction-type whitelist — this captures receipts, builds,
 *      transfers, adjustments, bills AND fulfillments/invoices uniformly).
 *   - Signed inventory impact = transactionline.quantity AS-IS.
 *   - Per (item, location): opening = currentQOH - SUM(signed); final = QOH.
 *   - Transfers pair by transaction id (two opposite-signed legs).
 *
 * Then runs the real balance engine to count suspects.
 *
 * Run:  npx tsx scripts/inventoryReconcile.ts COM0067 BAS0009 COM0059
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto-js';
import axios from 'axios';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import { normalizeNsDate } from '../lib/netsuite';
import {
  computeLedger,
  summarizeNegatives,
  type LedgerTxn,
  type OpeningBalance,
  type TranType,
} from '../lib/inventory/balanceEngine';

const accountId = process.env.NETSUITE_ACCOUNT_ID || '';
const base = `https://${accountId.toLowerCase().replace(/_/g, '-')}.suitetalk.api.netsuite.com/services/rest`;
const oauth = new OAuth({
  consumer: {
    key: process.env.NETSUITE_CONSUMER_KEY || '',
    secret: process.env.NETSUITE_CONSUMER_SECRET || '',
  },
  signature_method: 'HMAC-SHA256',
  hash_function: (b: string, k: string) => crypto.HmacSHA256(b, k).toString(crypto.enc.Base64),
});
const tok = { key: process.env.NETSUITE_TOKEN_ID || '', secret: process.env.NETSUITE_TOKEN_SECRET || '' };
function auth(url: string, method: string) {
  return oauth
    .toHeader(oauth.authorize({ url, method }, tok))
    .Authorization.replace('OAuth ', `OAuth realm="${accountId.toUpperCase()}",`);
}
async function reqRaw(method: string, path: string, body?: any) {
  const url = `${base}${path}`;
  const r = await axios({
    method,
    url,
    headers: { Authorization: auth(url, method), 'Content-Type': 'application/json', Accept: 'application/json', prefer: 'transient' },
    data: body ? JSON.stringify(body) : undefined,
    validateStatus: () => true,
  });
  return r;
}
/** Paginated SuiteQL — loops offset until hasMore is false. */
async function sqlAll<T = any>(q: string): Promise<T[]> {
  const query = q.replace(/\s+/g, ' ').trim();
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const r = await reqRaw('POST', `/query/v1/suiteql?limit=1000&offset=${offset}`, { q: query });
    if (r.status >= 400) throw new Error(`SuiteQL ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    out.push(...(r.data.items || []));
    if (!r.data.hasMore) break;
    offset += 1000;
  }
  return out;
}

const NS_TO_TYPE: Record<string, TranType> = {
  ItemRcpt: 'IR',
  ItemShip: 'IF',
  InvTrnfr: 'IT',
  Build: 'BUILD',
  Unbuild: 'UNBUILD',
  InvAdjst: 'ADJ',
  VendBill: 'BILL',
};
const n = (v: any) => (v == null || v === '' ? NaN : Number(v));
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

interface Anchor {
  loc: string; // substring match on location name
  opening?: number;
  final?: number;
  suspects?: number;
}
const ANCHORS: Record<string, Anchor[]> = {
  COM0067: [
    { loc: 'Ambix', final: 2616 },
    { loc: 'Bio-Direct', opening: 932, final: 0 },
    { loc: 'Main', final: -22946 }, // note: several "Main"/"MAIN" locations exist
  ],
  BAS0009: [{ loc: '*', suspects: 0 }],
};

async function reconcile(code: string) {
  console.log(`\n${'='.repeat(70)}\nITEM ${code}\n${'='.repeat(70)}`);
  const itemRows = await sqlAll<any>(
    `SELECT id, itemid, BUILTIN.DF(itemtype) AS itype FROM item WHERE UPPER(itemid)='${code.toUpperCase()}'`,
  );
  if (!itemRows.length) {
    console.log('  NOT FOUND');
    return;
  }
  const itemId = String(itemRows[0].id);
  console.log(`  nsItemId=${itemId}  type=${itemRows[0].itype}`);

  // Inventory-affecting lines — NO type whitelist.
  const lines = await sqlAll<any>(
    `SELECT t.id AS tx_id, t.tranid AS doc, t.trandate, t.type AS ns_type,
            tl.id AS line_id, tl.location, BUILTIN.DF(tl.location) AS loc_name,
            tl.quantity, tl.isinventoryaffecting, tl.iscogs, tl.iscustomglline
       FROM transactionline tl
       JOIN transaction t ON t.id = tl.transaction
      WHERE tl.item = ${itemId}
        AND tl.isinventoryaffecting = 'T'
      ORDER BY t.trandate, t.id, tl.id`,
  );

  // Current QOH per location.
  const qohRows = await sqlAll<any>(
    `SELECT il.location AS loc, BUILTIN.DF(il.location) AS loc_name, SUM(il.quantityonhand) AS qoh
       FROM inventorybalance il WHERE il.item = ${itemId}
      GROUP BY il.location, BUILTIN.DF(il.location)`,
  );
  const qohByLoc = new Map<string, number>();
  const nameByLoc = new Map<string, string>();
  for (const r of qohRows) {
    qohByLoc.set(String(r.loc), n(r.qoh));
    nameByLoc.set(String(r.loc), r.loc_name);
  }

  // Build engine rows.
  const typeCounts: Record<string, number> = {};
  let noLoc = 0;
  let noQty = 0;
  const txns: LedgerTxn[] = [];
  for (const r of lines) {
    typeCounts[r.ns_type] = (typeCounts[r.ns_type] ?? 0) + 1;
    const qty = n(r.quantity);
    if (!Number.isFinite(qty)) {
      noQty++;
      continue;
    }
    const locId = r.location == null ? '(no location)' : String(r.location);
    if (r.location == null) noLoc++;
    if (r.loc_name) nameByLoc.set(locId, r.loc_name);
    txns.push({
      id: `${r.tx_id}-${r.line_id}`,
      nsTransactionId: String(r.tx_id),
      lineId: String(r.line_id),
      docNumber: r.doc,
      tranDate: normalizeNsDate(r.trandate) || r.trandate,
      tranType: NS_TO_TYPE[r.ns_type] ?? 'ADJ',
      locationNsId: locId,
      locationName: nameByLoc.get(locId) || locId,
      signedQty: qty,
    });
  }

  // Per-location sums.
  const sumByLoc = new Map<string, number>();
  for (const t of txns) sumByLoc.set(t.locationNsId, (sumByLoc.get(t.locationNsId) ?? 0) + t.signedQty);

  const allLocs = new Set<string>([...sumByLoc.keys(), ...qohByLoc.keys()]);
  const openings: OpeningBalance[] = [];
  for (const loc of allLocs) {
    const qoh = qohByLoc.get(loc) ?? 0;
    const sum = sumByLoc.get(loc) ?? 0;
    openings.push({
      locationNsId: loc,
      locationName: nameByLoc.get(loc) || loc,
      openingQty: qoh - sum,
      currentQoh: qoh,
    });
  }

  const ledger = computeLedger(txns, openings);
  const negs = summarizeNegatives(ledger);

  console.log(`  lines(inv-affecting)=${lines.length} usable=${txns.length} noLocation=${noLoc} noQty=${noQty}`);
  console.log(`  typeCounts=${JSON.stringify(typeCounts)}`);
  console.log(`  suspects=${ledger.suspectRowIds.size}`);
  console.log(`  ${'LOCATION'.padEnd(42)} ${'sum'.padStart(11)} ${'opening'.padStart(11)} ${'final/QOH'.padStart(11)} ${'deepest<0'.padStart(11)}`);
  const sorted = openings.sort((a, b) => a.locationName.localeCompare(b.locationName));
  for (const o of sorted) {
    const final = ledger.byLocation[o.locationNsId]?.final ?? o.openingQty;
    const deep = negs[o.locationNsId]?.deepestBalance;
    console.log(
      `  ${(o.locationName + ' [' + o.locationNsId + ']').padEnd(42)} ${fmt(sumByLoc.get(o.locationNsId) ?? 0).padStart(11)} ${fmt(o.openingQty).padStart(11)} ${fmt(final).padStart(11)} ${(deep != null ? fmt(deep) : '·').padStart(11)}`,
    );
  }

  // VendBill spotlight (to resolve the sign question).
  const bills = txns.filter((t) => t.tranType === 'BILL');
  if (bills.length) {
    console.log(`  VendBill lines (${bills.length}): ${JSON.stringify(bills.slice(0, 6).map((b) => ({ doc: b.docNumber, loc: b.locationName, qty: b.signedQty, date: b.tranDate })))}`);
  }

  // Anchor checks.
  const anchors = ANCHORS[code];
  if (anchors) {
    console.log(`  --- ANCHOR CHECKS ---`);
    for (const a of anchors) {
      if (a.suspects != null) {
        const pass = ledger.suspectRowIds.size === a.suspects;
        console.log(`    [${pass ? 'PASS' : 'FAIL'}] suspects = ${ledger.suspectRowIds.size} (expected ${a.suspects})`);
        continue;
      }
      const match = sorted.filter((o) => o.locationName.includes(a.loc));
      if (!match.length) {
        console.log(`    [FAIL] no location matching "${a.loc}"`);
        continue;
      }
      for (const o of match) {
        const final = ledger.byLocation[o.locationNsId]?.final ?? o.openingQty;
        const parts: string[] = [];
        if (a.opening != null) parts.push(`opening ${fmt(o.openingQty)} vs ${a.opening} ${Math.abs(o.openingQty - a.opening) < 0.5 ? 'PASS' : 'FAIL'}`);
        if (a.final != null) parts.push(`final ${fmt(final)} vs ${a.final} ${Math.abs(final - a.final) < 0.5 ? 'PASS' : 'FAIL'}`);
        console.log(`    "${a.loc}" → ${o.locationName} [${o.locationNsId}]: ${parts.join(' | ')}`);
      }
    }
  }
}

async function main() {
  const codes = process.argv.slice(2);
  const targets = codes.length ? codes : ['COM0067', 'BAS0009', 'COM0059'];
  for (const c of targets) await reconcile(c);
}
main().catch((e) => {
  console.error('FATAL', e?.message ?? e);
  process.exit(1);
});
