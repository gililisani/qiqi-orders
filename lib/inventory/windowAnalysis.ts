/**
 * Per-negative-window cause / replenishment analysis. Pure — no I/O.
 *
 * For one negative window at one location, answer the two questions from the
 * owner's investigation workflow:
 *   - WHAT CAUSED IT  — the outbound lines during the window, classified by the
 *     owner's rule: an Inventory Transfer, an Item Fulfillment GENERATED FROM A
 *     TRANSFER ORDER (chainRole==='if'), or a negative Inventory Adjustment are
 *     *editable* causes; an Item Fulfillment to a customer (no TO chain) is shown
 *     but flagged NON-editable ("you shipped more than you had"); a Build consumes
 *     components (physical — not editable).
 *   - WHAT STOPPED IT — the inbound lines on the recovery date that brought the
 *     balance back to ≥ 0 (Item Receipt, Inventory Transfer in, Assembly Build
 *     output, positive Inventory Adjustment).
 *
 * Editability mirrors the worklist engine (raw nsTypeCode), with the IF-from-TO
 * exception. The numbers themselves come from the snapshot-anchored ledger, so
 * "during the window" is trustworthy wherever the window is verified.
 */
import type { LocationLedger, AnnotatedTxn } from '@/lib/inventory/balanceEngine';

export interface AnalyzedTxn {
  id: string;
  nsTransactionId: string;
  doc: string;
  date: string;
  nsTypeCode: string | null;
  typeLabel: string;
  qty: number; // signed (− outbound / + inbound)
  direction: 'out' | 'in';
  editable: boolean;
  fromTO: boolean; // Item Fulfillment that is the source leg of a TOrdCost chain
  relatesToAssembly: boolean; // Build (component consumption OR assembly output)
  note: string;
}

export interface WindowAnalysis {
  start: string;
  end: string | null; // null = ongoing (never recovered)
  depth: number; // most-negative EOD within the window
  durationDays: number;
  /** Window overlaps a snapshot-to-snapshot span that didn't reconcile — its
   *  numbers are approximate (only meaningful when snapshots were applied). */
  unreconciled: boolean;
  causedBy: AnalyzedTxn[];
  stoppedBy: AnalyzedTxn[];
}

const TYPE_LABEL: Record<string, string> = {
  InvTrnfr: 'Inventory Transfer',
  InvAdjst: 'Inventory Adjustment',
  ItemRcpt: 'Item Receipt',
  ItemShip: 'Item Fulfillment',
  Build: 'Assembly Build',
  Unbuild: 'Assembly Unbuild',
  VendBill: 'Bill',
  CustInvc: 'Invoice',
  CashSale: 'Cash Sale',
  CustCred: 'Credit Memo',
  CustRfnd: 'Customer Refund',
};

/** Classify a single ledger row for the cause/replenishment view. */
export function classifyTxn(row: AnnotatedTxn): AnalyzedTxn {
  const code = row.nsTypeCode ?? null;
  const direction: 'out' | 'in' = row.signedQty < 0 ? 'out' : 'in';
  const fromTO = code === 'ItemShip' && row.chainRole === 'if';
  const relatesToAssembly = code === 'Build' || code === 'Unbuild';

  let editable = false;
  let note = '';
  switch (code) {
    case 'InvTrnfr':
      editable = true;
      note = 'Inventory Transfer — editable (date / quantity / delete).';
      break;
    case 'InvAdjst':
      editable = true;
      note = 'Inventory Adjustment — editable.';
      break;
    case 'ItemRcpt':
      editable = true;
      note = 'Item Receipt — editable (e.g. backdate to before the window).';
      break;
    case 'VendBill':
      editable = true;
      note = 'Bill — editable (rarely inventory-affecting on this account).';
      break;
    case 'ItemShip':
      if (fromTO) {
        editable = true;
        note = 'Item Fulfillment generated from a Transfer Order — editable as part of the chain (travels with its Item Receipt).';
      } else {
        editable = false;
        note = 'Item Fulfillment to a customer — NOT editable. If this drove the negative, you shipped more than you had (oversold); no backdating fixes it.';
      }
      break;
    case 'Build':
      editable = false;
      note = direction === 'out'
        ? 'Assembly Build consumed this item as a component — physical, not directly editable (but the Build itself may be backdatable).'
        : 'Assembly Build produced this item — physical event.';
      break;
    default:
      editable = false;
      note = `${TYPE_LABEL[code ?? ''] ?? code ?? 'Unknown'} — not editable.`;
  }

  return {
    id: row.id,
    nsTransactionId: row.nsTransactionId,
    doc: row.docNumber,
    date: row.tranDate,
    nsTypeCode: code,
    typeLabel: TYPE_LABEL[code ?? ''] ?? code ?? 'Unknown',
    qty: row.signedQty,
    direction,
    editable,
    fromTO,
    relatesToAssembly,
    note,
  };
}

/**
 * Analyze one negative window on a location lane.
 * `start` = first date EOD < 0; `end` = recovery date (EOD ≥ 0), or null if it
 * never recovered within the data.
 */
function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000));
}

export function analyzeNegativeWindow(lane: LocationLedger, start: string, end: string | null): WindowAnalysis {
  const inWindow = (d: string) => d >= start && (end === null || d < end);

  // Most-negative EOD within the window.
  let depth = 0;
  let lastDate = start;
  for (const p of lane.eodTimeline) {
    if (!inWindow(p.date)) continue;
    if (p.eod < depth) depth = p.eod;
    lastDate = p.date;
  }
  const durationDays = daysBetween(start, end ?? lastDate);

  // Approximate if any unreconciled span touches this window.
  const endRef = end ?? '9999-12-31';
  const unreconciled = (lane.unverifiedSegments ?? []).some((seg) => seg.to >= start && seg.from <= endRef);

  // CAUSED BY: every outbound line inside the window. Most-impactful first.
  const causedBy = lane.rows
    .filter((r) => r.signedQty < 0 && inWindow(r.tranDate))
    .map(classifyTxn)
    .sort((a, b) => a.qty - b.qty); // most negative first

  // STOPPED BY: the inbound lines ON the recovery date (what tipped it ≥ 0).
  // Ongoing window (end === null) → nothing stopped it yet.
  const stoppedBy =
    end === null
      ? []
      : lane.rows
          .filter((r) => r.signedQty > 0 && r.tranDate === end)
          .map(classifyTxn)
          .sort((a, b) => b.qty - a.qty); // largest inflow first

  return { start, end, depth, durationDays, unreconciled, causedBy, stoppedBy };
}

/** Analyze every negative window on a lane (derived from its EOD timeline). */
export function analyzeLaneWindows(lane: LocationLedger): WindowAnalysis[] {
  const out: WindowAnalysis[] = [];
  let inW = false;
  let start = '';
  for (const p of lane.eodTimeline) {
    if (p.eod < 0) {
      if (!inW) {
        inW = true;
        start = p.date;
      }
    } else if (inW) {
      out.push(analyzeNegativeWindow(lane, start, p.date));
      inW = false;
    }
  }
  if (inW) out.push(analyzeNegativeWindow(lane, start, null));
  return out;
}
