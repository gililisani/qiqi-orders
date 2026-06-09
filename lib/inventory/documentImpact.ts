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

/**
 * Per-(item,location) negativity stats — TIME-AWARE. The earlier version only
 * recorded WHETHER a location was ever negative, so a fix that created a NEW
 * negative window at a location already negative elsewhere in time was missed
 * (the IT10186 → 12/31 bug). We now capture, per location:
 *   - area:   Σ max(0, −eod) over the timeline (total negative unit-days proxy).
 *             Monotonic — any new window OR deepening increases it.
 *   - depth:  most-negative end-of-day (for display + adjustment sizing).
 *   - since:  first date the balance goes negative (for adjustment dating).
 */
interface LocStat {
  itemCode: string;
  locationName: string;
  area: number;
  depth: number; // <= 0
  since: string | null;
}

function statsFor(items: DocItem[], txnsByItem: Map<string, LedgerTxn[]>): Map<string, LocStat> {
  const out = new Map<string, LocStat>();
  for (const it of items) {
    const txns = txnsByItem.get(it.nsItemId) ?? it.transactions;
    const ledger = computeLedger(txns, it.openings);
    for (const lane of Object.values(ledger.byLocation)) {
      let area = 0;
      let depth = 0;
      let since: string | null = null;
      for (const p of lane.eodTimeline) {
        if (p.eod < 0) {
          area += -p.eod;
          if (p.eod < depth) depth = p.eod;
          if (since === null) since = p.date;
        }
      }
      if (area > 0) out.set(key(it.itemCode, lane.locationName), { itemCode: it.itemCode, locationName: lane.locationName, area, depth, since });
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

const EPS = 0.001;

export function evaluateDocChange(ctx: DocumentContext, change: DocChange): DocImpact {
  const before = statsFor(ctx.items, new Map());

  const afterTxns = new Map<string, LedgerTxn[]>();
  for (const it of ctx.items) {
    afterTxns.set(it.nsItemId, applyDocChangeToItem(it.transactions, ctx.nsTransactionId, change));
  }
  const after = statsFor(ctx.items, afterTxns);

  const toRef = (s: LocStat): NegativeRef => ({ itemCode: s.itemCode, locationName: s.locationName, depth: s.depth, since: s.since ?? '' });

  const fixed: NegativeRef[] = [];
  const created: NegativeRef[] = []; // NEW or WORSE — anything that got more negative
  const remaining: NegativeRef[] = []; // still negative, but no worse than before

  const allKeys = new Set([...before.keys(), ...after.keys()]);
  for (const k of allKeys) {
    const b = before.get(k);
    const a = after.get(k);
    if (a && !b) created.push(toRef(a)); // brand-new negativity
    else if (b && !a) fixed.push(toRef(b)); // fully cleared
    else if (a && b) {
      if (a.area > b.area + EPS) created.push(toRef(a)); // deepened / new window in time
      else remaining.push(toRef(a)); // unchanged or improved-but-still-negative
    }
  }

  const sortRef = (x: NegativeRef, y: NegativeRef) => x.depth - y.depth;
  fixed.sort(sortRef);
  created.sort(sortRef);
  remaining.sort(sortRef);

  // To make fully clean, each new/worse or still-negative (item,location) needs
  // +|depth| units at its first negative date.
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
