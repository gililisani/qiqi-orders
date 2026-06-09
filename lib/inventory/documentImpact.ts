/**
 * Document Impact Analyzer — reason at the DOCUMENT level, not the (item,location)
 * level. A single NetSuite document (e.g. transfer IT10186) can carry many items
 * across two locations; you can only edit it as a whole (one new date, or delete).
 * This module computes the full consequence of such a change across EVERY item
 * and location the document touches.
 *
 * SERVER-ONLY data pull (pullDocumentContext); the evaluation (evaluateDocChange,
 * findBestDate) is pure so it can be unit-tested and reused.
 */
import { createNetSuiteAPI } from '@/lib/netsuite';
import { assembleItem, type OpeningAnchor } from '@/lib/inventory/assemble';
import {
  computeLedger,
  summarizeNegatives,
  applyChanges,
  type LedgerTxn,
  type OpeningBalance,
  type SimChange,
} from '@/lib/inventory/balanceEngine';
import { readSnapshotLookup } from '@/lib/inventory/openingSnapshot';

const ITEM_TYPES = `('InvtPart','Assembly')`;

// ── Types ────────────────────────────────────────────────────────────────────
export interface DocItem {
  nsItemId: string;
  itemCode: string;
  itemName: string | null;
  transactions: LedgerTxn[];
  openings: OpeningBalance[];
}

export interface DocLeg {
  itemCode: string;
  locationName: string;
  signedQty: number;
}

export interface DocumentContext {
  docNumber: string;
  nsTransactionId: string;
  nsType: string | null; // raw type code
  tranDate: string; // current date (ISO)
  legs: DocLeg[]; // every inventory line on the doc (this is what makes it multi-item)
  items: DocItem[]; // full snapshot-anchored history for each affected item
  itemCount: number;
  locationNames: string[];
}

export type DocChange =
  | { kind: 'delete' }
  | { kind: 'changeDate'; newDate: string };

export interface NegativeRef {
  itemCode: string;
  locationName: string;
  depth: number; // deepest end-of-day in the (item,location) — negative
  since: string;
}

export interface AdjustmentSuggestion {
  itemCode: string;
  locationName: string;
  date: string; // first date it goes negative under the proposed change
  addQty: number; // units to add to clear it (= |deepest|)
}

export interface DocImpact {
  change: DocChange;
  fixed: NegativeRef[]; // negatives present now, gone after
  created: NegativeRef[]; // negatives not present now, appear after
  remaining: NegativeRef[]; // negatives present now AND after (unchanged/!resolved)
  netResolved: number; // fixed.length − created.length
  clean: boolean; // created.length === 0 && fixed.length > 0
  adjustments: AdjustmentSuggestion[]; // to clear everything still/newly negative after the change
}

// ── Pure evaluation ──────────────────────────────────────────────────────────

const key = (itemCode: string, loc: string) => `${itemCode}|||${loc}`;

/** All (item,location) negatives across the document's affected items, given a
 *  per-item transaction override (the change already applied or not). */
function negativesFor(items: DocItem[], txnsByItem: Map<string, LedgerTxn[]>): Map<string, NegativeRef> {
  const out = new Map<string, NegativeRef>();
  for (const it of items) {
    const txns = txnsByItem.get(it.nsItemId) ?? it.transactions;
    const ledger = computeLedger(txns, it.openings);
    const negs = summarizeNegatives(ledger);
    for (const n of Object.values(negs)) {
      out.set(key(it.itemCode, n.locationName), {
        itemCode: it.itemCode,
        locationName: n.locationName,
        depth: n.deepestBalance,
        since: n.spans[0]?.from ?? n.deepestDate,
      });
    }
  }
  return out;
}

/** Apply a document-level change to a single item's transactions. The doc is
 *  identified by nsTransactionId across all items (transfer legs of the SAME
 *  document share it). */
function applyDocChangeToItem(txns: LedgerTxn[], nsTransactionId: string, change: DocChange): LedgerTxn[] {
  const simChange: SimChange =
    change.kind === 'delete'
      ? { kind: 'delete', nsTransactionId }
      : { kind: 'changeDate', nsTransactionId, newDate: change.newDate };
  return applyChanges(txns, [simChange]);
}

export function evaluateDocChange(ctx: DocumentContext, change: DocChange): DocImpact {
  const before = negativesFor(ctx.items, new Map());

  const afterTxns = new Map<string, LedgerTxn[]>();
  for (const it of ctx.items) {
    afterTxns.set(it.nsItemId, applyDocChangeToItem(it.transactions, ctx.nsTransactionId, change));
  }
  const after = negativesFor(ctx.items, afterTxns);

  const fixed: NegativeRef[] = [];
  const created: NegativeRef[] = [];
  const remaining: NegativeRef[] = [];

  for (const [k, n] of before) {
    if (!after.has(k)) fixed.push(n);
    else remaining.push(after.get(k)!);
  }
  for (const [k, n] of after) {
    if (!before.has(k)) created.push(n);
  }

  const sortRef = (a: NegativeRef, b: NegativeRef) => a.depth - b.depth;
  fixed.sort(sortRef);
  created.sort(sortRef);
  remaining.sort(sortRef);

  // Adjustment quantification: to make everything clean AFTER the change, each
  // still-negative or newly-negative (item,location) needs +|depth| units.
  const adjustments: AdjustmentSuggestion[] = [...created, ...remaining].map((n) => ({
    itemCode: n.itemCode,
    locationName: n.locationName,
    date: n.since,
    addQty: Math.abs(n.depth),
  }));

  return {
    change,
    fixed,
    created,
    remaining,
    netResolved: fixed.length - created.length,
    clean: created.length === 0 && fixed.length > 0,
    adjustments,
  };
}

/**
 * Search for the single date that, applied to the whole document, best resolves
 * its negatives across all items with the fewest new problems. Candidate dates:
 * each item's inbound-receipt dates near the doc, plus the doc's own date ± a
 * window. Returns the best CLEAN date if one exists, else the best-effort.
 */
export function findBestDate(ctx: DocumentContext): { best: DocImpact | null; cleanDate: string | null } {
  // Candidate dates = distinct transaction dates across all affected items that
  // are >= 2024-01-01 (closed-period rule), deduped.
  const candidates = new Set<string>();
  for (const it of ctx.items) {
    for (const t of it.transactions) {
      if (t.tranDate >= '2024-01-01') candidates.add(t.tranDate);
    }
  }
  // Also consider the day after each inbound, a common "arrive in time" target.
  const dated = [...candidates].sort();

  let best: DocImpact | null = null;
  let cleanDate: string | null = null;
  for (const d of dated) {
    if (d === ctx.tranDate) continue; // no-op
    const impact = evaluateDocChange(ctx, { kind: 'changeDate', newDate: d });
    if (impact.clean && cleanDate === null) {
      cleanDate = d;
      best = impact;
      break; // earliest clean date wins
    }
    if (!best || impact.netResolved > best.netResolved) best = impact;
  }
  return { best, cleanDate };
}

// ── Server data pull ─────────────────────────────────────────────────────────

export async function pullDocumentContext(docNumber: string): Promise<DocumentContext> {
  const ns = createNetSuiteAPI();
  const esc = docNumber.replace(/'/g, "''").toUpperCase();

  // 1. The document header + its inventory-affecting legs (all items).
  const legRows = await ns.suiteQLPaged<any>(
    `SELECT t.id AS tx_id, t.tranid AS doc, t.trandate, t.type AS ns_type,
            tl.item AS item_id, i.itemid AS item_code, i.displayname AS item_name,
            BUILTIN.DF(tl.location) AS loc_name, tl.quantity
       FROM transactionline tl
       JOIN transaction t ON t.id = tl.transaction
       JOIN item i ON i.id = tl.item
      WHERE UPPER(t.tranid) = '${esc}'
        AND tl.isinventoryaffecting = 'T'
        AND i.itemtype IN ${ITEM_TYPES}
      ORDER BY i.itemid, tl.id`,
  );
  if (legRows.length === 0) throw new Error(`No inventory-affecting document found with number ${docNumber}`);

  const nsTransactionId = String(legRows[0].tx_id);
  const nsType = legRows[0].ns_type ?? null;
  const { normalizeNsDate } = await import('@/lib/netsuite');
  const tranDate = normalizeNsDate(legRows[0].trandate) || String(legRows[0].trandate);

  const legs: DocLeg[] = legRows.map((r: any) => ({
    itemCode: String(r.item_code),
    locationName: r.loc_name ?? '(no location)',
    signedQty: Number(r.quantity) || 0,
  }));
  const itemIds = [...new Set(legRows.map((r: any) => String(r.item_id)))];
  const locationNames = [...new Set(legs.map((l) => l.locationName))];

  // 2. Full inventory-affecting history for every affected item (one query).
  const idList = itemIds.join(', ');
  const lineRows = await ns.suiteQLPaged<any>(
    `SELECT t.id AS tx_id, t.tranid AS doc, t.trandate, t.type AS ns_type,
            BUILTIN.DF(t.type) AS ns_type_name, t.memo AS tx_memo,
            BUILTIN.DF(t.subsidiary) AS subsidiary_name,
            tl.id AS line_id, tl.item AS item_id, tl.location, BUILTIN.DF(tl.location) AS loc_name,
            tl.quantity, tl.memo AS line_memo
       FROM transactionline tl
       JOIN transaction t ON t.id = tl.transaction
      WHERE tl.item IN (${idList})
        AND tl.isinventoryaffecting = 'T'
      ORDER BY tl.item, t.trandate, t.id, tl.id`,
  );
  const qohRows = await ns.suiteQLPaged<any>(
    `SELECT il.item AS item_id, il.location AS loc, BUILTIN.DF(il.location) AS loc_name,
            SUM(il.quantityonhand) AS qoh
       FROM inventorybalance il
      WHERE il.item IN (${idList})
      GROUP BY il.item, il.location, BUILTIN.DF(il.location)`,
  );

  // Snapshot anchor (same as the rest of the tool).
  const { lookup, cutoffDate } = await readSnapshotLookup();

  const linesByItem = new Map<string, any[]>();
  for (const r of lineRows) (linesByItem.get(String(r.item_id)) ?? linesByItem.set(String(r.item_id), []).get(String(r.item_id))!).push(r);
  const qohByItem = new Map<string, any[]>();
  for (const r of qohRows) (qohByItem.get(String(r.item_id)) ?? qohByItem.set(String(r.item_id), []).get(String(r.item_id))!).push(r);

  const metaById = new Map<string, { code: string; name: string | null }>();
  for (const r of legRows) metaById.set(String(r.item_id), { code: String(r.item_code), name: r.item_name ?? null });

  const items: DocItem[] = [];
  for (const itemId of itemIds) {
    const meta = metaById.get(itemId)!;
    let anchor: OpeningAnchor | undefined;
    if (cutoffDate && lookup.size > 0) {
      const prefix = `${meta.code.toUpperCase()}|`;
      const openingByLocName = new Map<string, number>();
      for (const [k, v] of lookup) if (k.startsWith(prefix)) openingByLocName.set(k.slice(prefix.length), v);
      anchor = { cutoffDate, openingByLocName };
    }
    const assembled = assembleItem(linesByItem.get(itemId) ?? [], qohByItem.get(itemId) ?? [], anchor);
    items.push({
      nsItemId: itemId,
      itemCode: meta.code,
      itemName: meta.name,
      transactions: assembled.transactions,
      openings: assembled.openings,
    });
  }

  return {
    docNumber: legRows[0].doc ?? docNumber,
    nsTransactionId,
    nsType,
    tranDate,
    legs,
    items,
    itemCount: itemIds.length,
    locationNames,
  };
}
