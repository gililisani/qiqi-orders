/**
 * Auto-recommendation engine. For each (item, location) that goes negative,
 * pick the suspect transaction and find the best honest fix, using the SAME
 * balance engine + simulate() as the UI. Pure — no I/O.
 *
 * Per case:
 *  1. suspect = earliest "drove/deepened" outbound at the negative location.
 *  2. try fixes in order: REDUCE_QTY (reduce to zero the suspect-day EOD),
 *     DELETE, CHANGE_DATE_FORWARD (to the day after the next inbound at the loc).
 *  3. classify each via simulate(): CLEAN (target resolved + NO new negatives
 *     anywhere through end of data), PARTIAL (resolved but creates new), or
 *     INEFFECTIVE (target not resolved).
 *  4. recommend the first CLEAN; else MANUAL_REVIEW with the best PARTIAL shown.
 */
import {
  computeLedger,
  summarizeNegatives,
  simulate,
  type LedgerTxn,
  type OpeningBalance,
  type SimChange,
  type AnnotatedTxn,
  type LocationNegative,
} from '@/lib/inventory/balanceEngine';

export type WorklistAction = 'REDUCE_QTY' | 'DELETE' | 'CHANGE_DATE_FORWARD' | 'MANUAL_REVIEW';
export type Confidence = 'CLEAN' | 'PARTIAL' | 'NONE';

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
  depth: number; // deepest negative (negative number)
  since: string | null;
  recommendedAction: WorklistAction;
  suspectNsTransactionId: string | null;
  suspectDoc: string | null;
  suspectType: string | null;
  suspectDate: string | null;
  changeFrom: string | null;
  changeTo: string | null;
  confidence: Confidence;
  notes: string;
}

const fmt = (v: number) =>
  Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 });

const ACTION_LABEL: Record<WorklistAction, string> = {
  REDUCE_QTY: 'Reduce quantity',
  DELETE: 'Delete transaction',
  CHANGE_DATE_FORWARD: 'Change date forward',
  MANUAL_REVIEW: 'Needs manual review',
};
const ORDER: WorklistAction[] = ['REDUCE_QTY', 'DELETE', 'CHANGE_DATE_FORWARD'];

function addDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

interface Candidate {
  action: WorklistAction;
  change: SimChange;
  changeFrom: string;
  changeTo: string;
}

export function computeWorklistForItem(
  meta: ItemMeta,
  transactions: LedgerTxn[],
  openings: OpeningBalance[],
): WorklistRow[] {
  const ledger = computeLedger(transactions, openings);
  const negatives = summarizeNegatives(ledger);
  const rows: WorklistRow[] = [];
  for (const locId of Object.keys(negatives)) {
    rows.push(recommendCase(meta, transactions, openings, ledger, negatives[locId], locId));
  }
  return rows;
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
  const base = {
    itemCode: meta.itemCode,
    nsItemId: meta.nsItemId,
    itemName: meta.itemName,
    locationNsId: locId,
    locationName: neg.locationName,
    depth: neg.deepestBalance,
    since: neg.spans[0]?.from ?? null,
  };

  // Earliest suspect at this location (lane.rows are already engine-sorted).
  const suspect: AnnotatedTxn | undefined = lane.rows.find((r) => r.suspect);
  if (!suspect) {
    return {
      ...base,
      recommendedAction: 'MANUAL_REVIEW',
      suspectNsTransactionId: null,
      suspectDoc: null,
      suspectType: null,
      suspectDate: null,
      changeFrom: null,
      changeTo: null,
      confidence: 'NONE',
      notes: `${neg.locationName} is negative but no outbound transaction drove it (likely a negative opening / incomplete pre-go-live history). Manual review.`,
    };
  }

  const suspectMeta = {
    suspectNsTransactionId: suspect.nsTransactionId,
    suspectDoc: suspect.docNumber || null,
    suspectType: suspect.nsType || suspect.tranType,
    suspectDate: suspect.tranDate,
  };

  // Build candidate fixes in priority order.
  const candidates: Candidate[] = [];
  const mag = Math.abs(suspect.signedQty);
  const eodOnDay = lane.eodTimeline.find((p) => p.date === suspect.tranDate)?.eod ?? 0;
  const reduceTo = mag + eodOnDay; // eodOnDay < 0 → this lowers the magnitude
  if (reduceTo > 0 && reduceTo < mag) {
    candidates.push({
      action: 'REDUCE_QTY',
      change: { kind: 'changeQty', nsTransactionId: suspect.nsTransactionId, newQty: reduceTo },
      changeFrom: fmt(mag),
      changeTo: fmt(reduceTo),
    });
  }
  candidates.push({
    action: 'DELETE',
    change: { kind: 'delete', nsTransactionId: suspect.nsTransactionId },
    changeFrom: fmt(mag),
    changeTo: 'delete',
  });
  const nextInbound = lane.rows.find((r) => r.signedQty > 0 && r.tranDate > suspect.tranDate);
  if (nextInbound) {
    const newDate = addDay(nextInbound.tranDate);
    candidates.push({
      action: 'CHANGE_DATE_FORWARD',
      change: { kind: 'changeDate', nsTransactionId: suspect.nsTransactionId, newDate },
      changeFrom: suspect.tranDate,
      changeTo: newDate,
    });
  }

  // Evaluate every candidate with simulate().
  const evals = candidates.map((c) => {
    const res = simulate(txns, openings, c.change);
    const resolved = !res.after[locId]; // target location no longer negative anywhere
    const newProblem = res.delta.newProblem;
    return { c, resolved, newProblem };
  });

  // First CLEAN in priority order wins.
  const clean = evals.find((e) => e.resolved && e.newProblem.length === 0);
  if (clean) {
    return {
      ...base,
      ...suspectMeta,
      recommendedAction: clean.c.action,
      changeFrom: clean.c.changeFrom,
      changeTo: clean.c.changeTo,
      confidence: 'CLEAN',
      notes: `${ACTION_LABEL[clean.c.action]} resolves ${neg.locationName}. No new negatives anywhere through end of data.`,
    };
  }

  // Otherwise pick the best PARTIAL (least collateral; tie-break by priority).
  const collateral = (np: { depth: number }[]) => np.reduce((s, n) => s + Math.abs(n.depth), 0);
  const partials = evals
    .filter((e) => e.resolved && e.newProblem.length > 0)
    .sort(
      (a, b) =>
        collateral(a.newProblem) - collateral(b.newProblem) ||
        ORDER.indexOf(a.c.action) - ORDER.indexOf(b.c.action),
    );

  if (partials.length) {
    const p = partials[0];
    const detail = p.newProblem
      .map((n) => `${fmt(n.depth)} at ${n.locationName}${n.spans[0] ? ` from ${n.spans[0].from}` : ''}`)
      .join('; ');
    return {
      ...base,
      ...suspectMeta,
      recommendedAction: 'MANUAL_REVIEW',
      changeFrom: p.c.changeFrom,
      changeTo: p.c.changeTo,
      confidence: 'PARTIAL',
      notes: `No clean fix. Best candidate: ${ACTION_LABEL[p.c.action]} (${p.c.changeFrom} → ${p.c.changeTo}) resolves ${neg.locationName} but would create ${detail}.`,
    };
  }

  // No candidate even resolves the target.
  return {
    ...base,
    ...suspectMeta,
    recommendedAction: 'MANUAL_REVIEW',
    changeFrom: null,
    changeTo: null,
    confidence: 'NONE',
    notes: `No single-transaction fix on ${suspect.docNumber || 'the suspect'} resolves ${neg.locationName}. Manual review.`,
  };
}
