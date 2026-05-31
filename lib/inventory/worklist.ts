/**
 * Auto-recommendation engine with HARD business rules.
 *
 * RULE 1 — CLOSED PERIODS: never recommend editing a transaction dated before
 *   2024-01-01. If a location's negative ORIGINATES before 2024-01-01, the case
 *   is OUT OF SCOPE — CLOSED PERIOD (handled by accounting catch-up, not here).
 *
 * RULE 2 — ONLY CLERICAL TYPES ARE EDITABLE: a recommended fix may only target
 *   Inventory Transfer / Inventory Adjustment / Item Receipt / Vendor Bill.
 *   Assembly Build/Unbuild, Item Fulfillment, Invoice, Cash Sale, Credit Memo,
 *   Customer Refund represent physical/commercial reality and are NEVER edited.
 *   Editability keys on the RAW NetSuite type code (nsTypeCode), so unknown
 *   types are non-editable by default.
 *
 * Algorithm per (item, location) negative case:
 *   - trigger = first date the location's end-of-day goes negative.
 *   - if trigger < 2024-01-01 → CLOSED.
 *   - else generate candidate fixes ONLY from editable + post-2024 transactions
 *     at the location: outbound legs → reduce / change-date-forward / delete;
 *     late inbound legs → change-date-earlier. Simulate each across the full
 *     timeline; classify CLEAN (resolves target, no new negatives anywhere) /
 *     PARTIAL (resolves but creates new) / ineffective.
 *   - recommend the first CLEAN; else best PARTIAL as a starting point; else
 *     MANUAL (e.g. the only driver is a non-editable build/fulfillment).
 *
 * Uses the SAME balance engine + simulate() as the UI.
 */
import {
  computeLedger,
  summarizeNegatives,
  simulate,
  type Ledger,
  type LedgerTxn,
  type OpeningBalance,
  type SimChange,
  type AnnotatedTxn,
  type LocationLedger,
  type LocationNegative,
} from '@/lib/inventory/balanceEngine';
import { computeItemWindows, type NegativeWindow } from '@/lib/inventory/negativeWindows';

export const CLOSED_PERIOD_CUTOFF = '2024-01-01';

/** Raw NetSuite type codes that are clerical and therefore editable. */
export const EDITABLE_NS_TYPES = new Set(['InvTrnfr', 'InvAdjst', 'ItemRcpt', 'VendBill']);

/** Raw code → display label (for the worklist "transaction to edit" column). */
export const NS_TYPE_LABEL: Record<string, string> = {
  InvTrnfr: 'Inventory Transfer',
  InvAdjst: 'Inventory Adjustment',
  ItemRcpt: 'Item Receipt',
  VendBill: 'Bill',
  Build: 'Assembly Build',
  Unbuild: 'Assembly Unbuild',
  ItemShip: 'Item Fulfillment',
  CustInvc: 'Invoice',
  CashSale: 'Cash Sale',
  CustCred: 'Credit Memo',
  CustRfnd: 'Customer Refund',
};

export type WorklistAction =
  | 'REDUCE_QTY'
  | 'DELETE'
  | 'CHANGE_DATE_FORWARD'
  | 'CHANGE_DATE_EARLIER'
  | 'CREATE_TRANSFER'
  | 'MANUAL_REVIEW'
  | 'CLOSED_PERIOD';

export type Category = 'CLEAN' | 'PARTIAL' | 'MANUAL' | 'CLOSED';
export type Tier = 1 | 2 | 3 | 4;

export interface ItemMeta {
  itemCode: string;
  nsItemId: string | null;
  itemName: string | null;
}

export interface WorklistRow {
  itemCode: string;
  nsItemId: string | null;
  itemName: string | null;
  locationNsId: string;
  locationName: string;
  depth: number;
  since: string | null;
  recommendedAction: WorklistAction;
  // The transaction the user should edit (only set for CLEAN / PARTIAL — always
  // an editable type dated on/after the cutoff).
  suspectNsTransactionId: string | null;
  suspectDoc: string | null;
  suspectType: string | null; // RAW NS type code
  suspectDate: string | null;
  changeFrom: string | null;
  changeTo: string | null;
  category: Category;
  tier: Tier; // damage tier of the location's ongoing window (4 if recovered)
  notes: string;
}

const fmt = (v: number) =>
  Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 });

const ACTION_LABEL: Record<WorklistAction, string> = {
  REDUCE_QTY: 'Reduce quantity',
  DELETE: 'Delete transaction',
  CHANGE_DATE_FORWARD: 'Change date forward',
  CHANGE_DATE_EARLIER: 'Change date earlier',
  CREATE_TRANSFER: 'Create transfer',
  MANUAL_REVIEW: 'Needs manual review',
  CLOSED_PERIOD: 'Out of scope — closed period',
};

const isEditable = (t: { nsTypeCode?: string | null }) => !!t.nsTypeCode && EDITABLE_NS_TYPES.has(t.nsTypeCode);
const inScope = (date: string) => date >= CLOSED_PERIOD_CUTOFF;

function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Candidate {
  action: WorklistAction;
  priority: number; // lower = preferred
  tx: AnnotatedTxn;
  change: SimChange;
  changeFrom: string;
  changeTo: string;
}

export function computeWorklistForItem(
  meta: ItemMeta,
  transactions: LedgerTxn[],
  openings: OpeningBalance[],
  ledger?: Ledger,
  windows?: NegativeWindow[],
): WorklistRow[] {
  const lg = ledger ?? computeLedger(transactions, openings);
  const wins = windows ?? computeItemWindows(meta, lg);
  const ongoingTierByLoc = new Map<string, Tier>();
  for (const w of wins) if (w.status === 'Ongoing') ongoingTierByLoc.set(w.locationNsId, w.tier);

  const negatives = summarizeNegatives(lg);
  const rows: WorklistRow[] = [];
  for (const locId of Object.keys(negatives)) {
    const row = recommendCase(meta, transactions, openings, lg, negatives[locId], locId);
    row.tier = ongoingTierByLoc.get(locId) ?? 4; // recovered locations are Tier 4
    rows.push(row);
  }
  return rows;
}

/** Carried balance at a location at the END of `date` (or opening if no prior activity). */
function balanceAsOf(lane: LocationLedger, date: string): number {
  let bal = lane.opening;
  for (const p of lane.eodTimeline) {
    if (p.date <= date) bal = p.eod;
    else break;
  }
  return bal;
}

/** Set of "sourceLoc->destLoc" pairs seen among existing transfers (operational plausibility). */
function existingTransferPairs(txns: LedgerTxn[]): Set<string> {
  const byTx = new Map<string, LedgerTxn[]>();
  for (const t of txns) {
    if (t.nsTypeCode !== 'InvTrnfr') continue;
    const a = byTx.get(t.nsTransactionId);
    if (a) a.push(t);
    else byTx.set(t.nsTransactionId, [t]);
  }
  const pairs = new Set<string>();
  for (const legs of byTx.values()) {
    const src = legs.find((l) => l.signedQty < 0);
    const dst = legs.find((l) => l.signedQty > 0);
    if (src && dst) pairs.add(`${src.locationNsId}->${dst.locationNsId}`);
  }
  return pairs;
}

function recommendCase(
  meta: ItemMeta,
  txns: LedgerTxn[],
  openings: OpeningBalance[],
  ledger: ReturnType<typeof computeLedger>,
  neg: LocationNegative,
  locId: string,
): WorklistRow {
  const lane = ledger.byLocation[locId];
  const trigger = neg.spans[0]?.from ?? neg.deepestDate;
  const base = {
    itemCode: meta.itemCode,
    nsItemId: meta.nsItemId,
    itemName: meta.itemName,
    locationNsId: locId,
    locationName: neg.locationName,
    depth: neg.deepestBalance,
    since: trigger,
    tier: 4 as Tier, // overridden by computeWorklistForItem from the ongoing window
  };
  const noFix = {
    suspectNsTransactionId: null,
    suspectDoc: null,
    suspectType: null,
    suspectDate: null,
    changeFrom: null,
    changeTo: null,
  };

  // RULE 1 — negative originates in a closed period.
  if (trigger && trigger < CLOSED_PERIOD_CUTOFF) {
    return {
      ...base,
      ...noFix,
      recommendedAction: 'CLOSED_PERIOD',
      category: 'CLOSED',
      notes: `${neg.locationName} first goes negative ${trigger} (pre-2024, closed period). Out of scope here — resolve via the separate accounting catch-up.`,
    };
  }

  // Build candidate fixes ONLY from editable + in-scope transactions at this location.
  const candidates: Candidate[] = [];
  const eodByDate = new Map(lane.eodTimeline.map((p) => [p.date, p.eod]));

  for (const r of lane.rows) {
    if (!isEditable(r) || !inScope(r.tranDate)) continue;

    if (r.signedQty < 0 && r.tranDate <= neg.deepestDate) {
      // Outbound that contributed to the shortage.
      const mag = Math.abs(r.signedQty);
      const eod = eodByDate.get(r.tranDate) ?? 0;
      const reduceTo = mag + eod; // eod < 0 lowers magnitude
      if (reduceTo > 0 && reduceTo < mag) {
        candidates.push({
          action: 'REDUCE_QTY',
          priority: 10,
          tx: r,
          change: { kind: 'changeQty', nsTransactionId: r.nsTransactionId, newQty: reduceTo },
          changeFrom: fmt(mag),
          changeTo: fmt(reduceTo),
        });
      }
      const nextInbound = lane.rows.find((x) => x.signedQty > 0 && x.tranDate > r.tranDate);
      if (nextInbound) {
        const newDate = shiftDay(nextInbound.tranDate, 1);
        candidates.push({
          action: 'CHANGE_DATE_FORWARD',
          priority: 20,
          tx: r,
          change: { kind: 'changeDate', nsTransactionId: r.nsTransactionId, newDate },
          changeFrom: r.tranDate,
          changeTo: newDate,
        });
      }
      candidates.push({
        action: 'DELETE',
        priority: 30,
        tx: r,
        change: { kind: 'delete', nsTransactionId: r.nsTransactionId },
        changeFrom: fmt(mag),
        changeTo: 'delete',
      });
    } else if (r.signedQty > 0 && trigger && r.tranDate > trigger) {
      // Late inbound — should it have arrived before the shortage?
      const newDate = trigger; // same day as the shortage → end-of-day covers it
      candidates.push({
        action: 'CHANGE_DATE_EARLIER',
        priority: 20,
        tx: r,
        change: { kind: 'changeDate', nsTransactionId: r.nsTransactionId, newDate },
        changeFrom: r.tranDate,
        changeTo: newDate,
      });
    }
  }

  // Evaluate every candidate against the FULL item timeline.
  const evals = candidates
    .map((c) => {
      const res = simulate(txns, openings, c.change);
      const resolved = !res.after[locId];
      return { c, resolved, newProblem: res.delta.newProblem };
    })
    .sort((a, b) => a.c.priority - b.c.priority || b.c.tx.tranDate.localeCompare(a.c.tx.tranDate));

  const clean = evals.find((e) => e.resolved && e.newProblem.length === 0);
  if (clean) {
    return {
      ...base,
      recommendedAction: clean.c.action,
      suspectNsTransactionId: clean.c.tx.nsTransactionId,
      suspectDoc: clean.c.tx.docNumber || null,
      suspectType: clean.c.tx.nsTypeCode ?? null,
      suspectDate: clean.c.tx.tranDate,
      changeFrom: clean.c.changeFrom,
      changeTo: clean.c.changeTo,
      category: 'CLEAN',
      notes: `${ACTION_LABEL[clean.c.action]} on ${clean.c.tx.docNumber} resolves ${neg.locationName}. No new negatives anywhere through end of data.`,
    };
  }

  // CREATE_TRANSFER (Part A) — only when no existing edit is clean. Inventing a
  // record is the most invasive fix, so it ranks last. Bring the trigger-day
  // end-of-day to zero from a surplus location.
  const eodAtTrigger = eodByDate.get(trigger) ?? neg.deepestBalance;
  const requiredQty = Math.abs(eodAtTrigger);
  if (requiredQty > 0) {
    const pairs = existingTransferPairs(txns);
    const cleanSources: { lane: LocationLedger; surplus: number; priorPair: boolean }[] = [];
    for (const src of Object.values(ledger.byLocation)) {
      if (src.locationNsId === locId || src.rows.length === 0) continue; // real location w/ prior activity
      const surplus = balanceAsOf(src, trigger);
      if (surplus < requiredQty) continue;
      const change: SimChange = {
        kind: 'createTransfer',
        source: src.locationNsId,
        sourceName: src.locationName,
        dest: locId,
        destName: neg.locationName,
        qty: requiredQty,
        date: trigger,
      };
      const res = simulate(txns, openings, change);
      if (!res.after[locId] && res.delta.newProblem.length === 0) {
        cleanSources.push({ lane: src, surplus, priorPair: pairs.has(`${src.locationNsId}->${locId}`) });
      }
    }
    if (cleanSources.length) {
      cleanSources.sort((a, b) => b.surplus - a.surplus || Number(b.priorPair) - Number(a.priorPair));
      const best = cleanSources[0];
      return {
        ...base,
        recommendedAction: 'CREATE_TRANSFER',
        suspectNsTransactionId: null,
        suspectDoc: null,
        suspectType: null,
        suspectDate: trigger, // proposed transfer date — validated >= cutoff
        changeFrom: null,
        changeTo: `Create IT: ${best.lane.locationName} → ${neg.locationName}, ${fmt(requiredQty)}, dated ${trigger}`,
        category: 'CLEAN',
        notes: `Source ${best.lane.locationName} has end-of-day surplus of ${fmt(best.surplus)} on ${trigger}${best.priorPair ? ' (has transferred here before)' : ''}; simulation shows no new negatives anywhere through end of data.`,
      };
    }
  }

  const collateral = (np: { depth: number }[]) => np.reduce((s, n) => s + Math.abs(n.depth), 0);
  const partials = evals
    .filter((e) => e.resolved && e.newProblem.length > 0)
    .sort((a, b) => collateral(a.newProblem) - collateral(b.newProblem) || a.c.priority - b.c.priority);

  if (partials.length) {
    const p = partials[0];
    const detail = p.newProblem
      .map((n) => `${fmt(n.depth)} at ${n.locationName}${n.spans[0] ? ` from ${n.spans[0].from}` : ''}`)
      .join('; ');
    return {
      ...base,
      recommendedAction: 'MANUAL_REVIEW',
      suspectNsTransactionId: p.c.tx.nsTransactionId,
      suspectDoc: p.c.tx.docNumber || null,
      suspectType: p.c.tx.nsTypeCode ?? null,
      suspectDate: p.c.tx.tranDate,
      changeFrom: p.c.changeFrom,
      changeTo: p.c.changeTo,
      category: 'PARTIAL',
      notes: `No clean fix. Best candidate: ${ACTION_LABEL[p.c.action]} on ${p.c.tx.docNumber} (${p.c.changeFrom} → ${p.c.changeTo}) resolves ${neg.locationName} but would create ${detail}.`,
    };
  }

  // Nothing editable resolves it — explain the (non-editable) driver for context.
  const driver = lane.rows.find((r) => r.suspect);
  const driverNote = driver
    ? ` Driven by ${driver.docNumber} (${NS_TYPE_LABEL[driver.nsTypeCode ?? ''] ?? driver.nsType ?? driver.tranType}), which is not an editable type.`
    : '';
  return {
    ...base,
    ...noFix,
    recommendedAction: 'MANUAL_REVIEW',
    category: 'MANUAL',
    notes: `No editable transfer/receipt/adjustment/bill on/after 2024-01-01 resolves ${neg.locationName}.${driverNote} Likely needs a new inventory adjustment — manual judgment.`,
  };
}

/**
 * Hard safety self-check. Returns any row whose recommended edit target violates
 * Rule 1 (pre-cutoff) or Rule 2 (non-editable type). MUST be empty.
 */
export function validateWorklist(rows: WorklistRow[]): {
  nonEditable: WorklistRow[];
  closedPeriod: WorklistRow[];
  createBad: WorklistRow[];
} {
  const nonEditable: WorklistRow[] = [];
  const closedPeriod: WorklistRow[] = [];
  const createBad: WorklistRow[] = [];
  for (const r of rows) {
    if (r.recommendedAction === 'CREATE_TRANSFER') {
      // No existing tx is edited; the invented transfer's date must be in scope.
      if (!r.suspectDate || r.suspectDate < CLOSED_PERIOD_CUTOFF) createBad.push(r);
      continue;
    }
    if (!r.suspectNsTransactionId) continue; // no recommended edit target
    if (!r.suspectType || !EDITABLE_NS_TYPES.has(r.suspectType)) nonEditable.push(r);
    if (r.suspectDate && r.suspectDate < CLOSED_PERIOD_CUTOFF) closedPeriod.push(r);
  }
  return { nonEditable, closedPeriod, createBad };
}
