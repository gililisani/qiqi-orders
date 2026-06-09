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
import { resolveOpeningAnchor } from '@/lib/inventory/asOfAnchor';

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
  | { kind: 'changeDate'; newDate: string }
  // Per-item reduction: newQtyByItem maps itemCode → new transfer MAGNITUDE for
  // that item's line. Items not listed are unchanged. (A transfer's lines are
  // edited independently in NetSuite, so reductions are per item.)
  | { kind: 'reduceQty'; newQtyByItem: Record<string, number> };

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
  beforeNegArea: number; // total negative area across all items/locations BEFORE
  afterNegArea: number; // total negative area AFTER (lower = better; the ranking metric)
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

/** Apply a document-level change to ONE item's transactions. The doc is
 *  identified by nsTransactionId across all items (legs of the SAME document
 *  share it). reduceQty is per item, so the item's code selects its new qty. */
function applyDocChangeToItem(it: DocItem, nsTransactionId: string, change: DocChange): LedgerTxn[] {
  if (change.kind === 'delete') {
    return applyChanges(it.transactions, [{ kind: 'delete', nsTransactionId }]);
  }
  if (change.kind === 'changeDate') {
    return applyChanges(it.transactions, [{ kind: 'changeDate', nsTransactionId, newDate: change.newDate }]);
  }
  // reduceQty: rewrite BOTH legs of this item's transfer line to the new
  // magnitude (source negative, dest positive), preserving direction.
  const mag = change.newQtyByItem[it.itemCode];
  if (mag == null) return it.transactions; // item unchanged
  const m = Math.abs(mag);
  return it.transactions.map((t) => {
    if (t.nsTransactionId !== nsTransactionId) return t;
    const sign = t.signedQty < 0 ? -1 : 1;
    return { ...t, signedQty: sign * m };
  });
}

const EPS = 0.001;

export function evaluateDocChange(ctx: DocumentContext, change: DocChange): DocImpact {
  const before = statsFor(ctx.items, new Map());

  const afterTxns = new Map<string, LedgerTxn[]>();
  for (const it of ctx.items) {
    afterTxns.set(it.nsItemId, applyDocChangeToItem(it, ctx.nsTransactionId, change));
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

  const areaSum = (m: Map<string, LocStat>) => [...m.values()].reduce((s, x) => s + x.area, 0);

  return {
    change,
    fixed,
    created,
    remaining,
    netResolved: fixed.length - created.length,
    clean: created.length === 0 && fixed.length > 0,
    adjustments,
    beforeNegArea: areaSum(before),
    afterNegArea: areaSum(after),
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
    // Best-effort = lowest remaining negativity (afterNegArea), not "net count".
    if (!best || impact.afterNegArea < best.afterNegArea - EPS) best = impact;
  }
  return { best, cleanDate };
}

// ── Reduce-quantity strategy (clear the SOURCE, quantify dest top-ups) ─────────

export interface ItemReduction {
  itemCode: string;
  sourceLocation: string;
  destLocation: string;
  originalQty: number;
  newQty: number; // reduced magnitude
  reducedBy: number;
}
export interface CompensatingTransfer {
  itemCode: string;
  destLocation: string;
  needQty: number; // units the destination still needs
  byDate: string; // when it first falls short
}
export interface ReducePlan {
  reductions: ItemReduction[];
  impact: DocImpact;
  compensatingTransfers: CompensatingTransfer[];
  sourceCleared: boolean; // true if no source location is left/made negative
  sourceCreatedArea: number; // new negativity at SOURCE locations (the only "damage" for reduce)
}

/** Lowest end-of-day at a location across the item's whole post-cutoff timeline. */
function lowestEod(it: DocItem, locationName: string, txns: LedgerTxn[]): number {
  const lane = Object.values(computeLedger(txns, it.openings).byLocation).find((l) => l.locationName === locationName);
  if (!lane) return 0;
  let lo = lane.opening;
  for (const p of lane.eodTimeline) if (p.eod < lo) lo = p.eod;
  return lo;
}

/**
 * For a transfer document, reduce each item's line just enough that the SOURCE
 * location never goes negative, then quantify what the DESTINATION then needs
 * (to be brought in separately). This is the holistic step-3 plan: minimize
 * source damage, list the compensating dest transfers.
 */
export function planReduceToClearSource(ctx: DocumentContext): ReducePlan | null {
  // Identify, per item, the source (negative leg) and dest (positive leg) on THIS doc.
  const newQtyByItem: Record<string, number> = {};
  const reductions: ItemReduction[] = [];

  for (const it of ctx.items) {
    const legs = it.transactions.filter((t) => t.nsTransactionId === ctx.nsTransactionId);
    const src = legs.find((l) => l.signedQty < 0);
    const dst = legs.find((l) => l.signedQty > 0);
    if (!src || !dst) continue; // not a 2-leg transfer line for this item
    const origQty = Math.abs(src.signedQty);

    // How negative does the source get at its worst (with the transfer present)?
    const srcLow = lowestEod(it, src.locationName, it.transactions);
    if (srcLow >= 0) continue; // source never negative → no reduction needed for it
    // Reducing the line by `r` lifts the source by `r` everywhere after the
    // transfer date. To clear the source, reduce by |srcLow| (capped at origQty).
    const reduceBy = Math.min(origQty, Math.abs(srcLow));
    const newQty = origQty - reduceBy;
    newQtyByItem[it.itemCode] = newQty;
    reductions.push({
      itemCode: it.itemCode,
      sourceLocation: src.locationName,
      destLocation: dst.locationName,
      originalQty: origQty,
      newQty,
      reducedBy: reduceBy,
    });
  }

  if (reductions.length === 0) return null;

  const impact = evaluateDocChange(ctx, { kind: 'reduceQty', newQtyByItem });

  // Compensating transfers = dest shortfalls AFTER the reduction (the dest now
  // receives less, so it may fall short — bring that in from elsewhere).
  const destLocs = new Set(reductions.map((r) => r.destLocation));
  const srcLocs = new Set(reductions.map((r) => r.sourceLocation));

  const compensatingTransfers: CompensatingTransfer[] = impact.created
    .concat(impact.remaining)
    .filter((n) => destLocs.has(n.locationName))
    .map((n) => ({ itemCode: n.itemCode, destLocation: n.locationName, needQty: Math.abs(n.depth), byDate: n.since }));

  // The ONLY real damage from a reduce is new negativity at a SOURCE location;
  // destination shortfalls are the expected compensating-transfer to-do list.
  const sourceCreatedArea = impact.created
    .filter((n) => srcLocs.has(n.locationName))
    .reduce((s, n) => s + Math.abs(n.depth), 0);

  return { reductions, impact, compensatingTransfers, sourceCleared: sourceCreatedArea < EPS, sourceCreatedArea };
}

// ── Ranked recommendation (always returns a best action) ──────────────────────

export type StrategyKind = 'changeDate' | 'delete' | 'reduceQty';

export interface DocRecommendation {
  strategy: StrategyKind;
  headline: string;
  impact: DocImpact;
  newDate?: string;
  reductions?: ItemReduction[];
  compensatingTransfers?: CompensatingTransfer[];
  rationale: string;
  // The damage metric this strategy is judged on (lower = better). For reduce,
  // this is SOURCE-side new negativity only (dest shortfalls are compensating
  // transfers, not damage); for date/delete it's total remaining negativity.
  score: number;
  sourceCleared?: boolean; // reduce only
}

/**
 * Always return a ranked best recommendation. Preference:
 *   1. a CLEAN single-date move (least invasive, no quantity surgery)
 *   2. otherwise the option with the LEAST collateral, measured by total new
 *      negative area; ties broken by fewest created locations then by strategy
 *      order (reduce ≺ date ≺ delete, since reduce is the most surgical).
 * The reduce plan always carries its compensating-transfer list so the residual
 * is fully spelled out.
 */
export function recommendDoc(ctx: DocumentContext): {
  recommendation: DocRecommendation;
  alternatives: DocRecommendation[];
} {
  const options: DocRecommendation[] = [];

  const { best: bestDateImpact, cleanDate } = findBestDate(ctx);
  // Only offer the date option if it actually IMPROVES things (a no-op 1-day
  // shift that fixes nothing is worthless and must never be "recommended").
  if (
    bestDateImpact &&
    bestDateImpact.change.kind === 'changeDate' &&
    (bestDateImpact.fixed.length > 0 || bestDateImpact.afterNegArea < bestDateImpact.beforeNegArea - EPS)
  ) {
    options.push({
      strategy: 'changeDate',
      newDate: bestDateImpact.change.newDate,
      headline: cleanDate ? `Move to ${cleanDate}` : `Best date: move to ${bestDateImpact.change.newDate}`,
      impact: bestDateImpact,
      score: bestDateImpact.afterNegArea, // date collateral is real damage → total negativity
      rationale: cleanDate
        ? 'A single date that resolves the document with no new negatives anywhere.'
        : 'No date is fully clean; this date reduces total negativity the most.',
    });
  }

  const del = evaluateDocChange(ctx, { kind: 'delete' });
  options.push({
    strategy: 'delete',
    headline: 'Delete the whole document',
    impact: del,
    score: del.afterNegArea, // delete collateral is real damage
    rationale: 'Removes every leg of the transfer.',
  });

  const reduce = planReduceToClearSource(ctx);
  if (reduce) {
    options.push({
      strategy: 'reduceQty',
      headline: reduce.sourceCleared
        ? 'Reduce quantities — clears the source cleanly'
        : 'Reduce quantities to minimize source negatives',
      impact: reduce.impact,
      reductions: reduce.reductions,
      compensatingTransfers: reduce.compensatingTransfers,
      // Reduce is judged on SOURCE damage only; dest shortfalls are the
      // compensating-transfer to-do list, not collateral.
      score: reduce.sourceCreatedArea,
      sourceCleared: reduce.sourceCleared,
      rationale:
        'Lower each item line to what the source can spare (so the source never goes negative), then bring the listed shortfalls into the destination separately.',
    });
  }

  // Rank: a fully-CLEAN option first; otherwise lowest score (each strategy's
  // own damage metric); ties → strategy preference (reduce is most surgical).
  const stratRank: Record<StrategyKind, number> = { reduceQty: 0, changeDate: 1, delete: 2 };
  const cleanish = (o: DocRecommendation) => o.impact.clean || (o.strategy === 'reduceQty' && o.sourceCleared);
  options.sort((a, b) => {
    const ca = cleanish(a);
    const cb = cleanish(b);
    if (ca !== cb) return ca ? -1 : 1;
    if (Math.abs(a.score - b.score) > EPS) return a.score - b.score;
    return stratRank[a.strategy] - stratRank[b.strategy];
  });

  return { recommendation: options[0], alternatives: options.slice(1) };
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

  // Opening anchor (RESTlet measured on-hand, else CSV snapshot).
  const { lookup, cutoffDate } = await resolveOpeningAnchor();

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
