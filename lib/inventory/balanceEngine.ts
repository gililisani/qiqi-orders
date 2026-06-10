/**
 * Inventory balance engine — PURE, deterministic, no I/O.
 *
 * This module is the single source of truth for inventory math. BOTH the
 * read-only investigation view AND the simulator call these functions, so the
 * numbers can never disagree. It operates on already-normalized transaction
 * rows + per-location opening balances; it never touches NetSuite or Supabase.
 *
 * ── Sort / ordering (addresses the same-day ordering question) ──────────────
 * Rows are ordered by (tranDate ASC, nsTransactionId ASC, lineId ASC).
 * NetSuite does not expose a reliable per-line intra-day posting timestamp via
 * SuiteQL (transactionline has no posting-time column; transaction.createddate
 * is record-creation time, not posting order, and is unreliable for
 * back-dated fixes). The internal-id ascending order is NetSuite's own
 * tie-break for same-date inventory activity, so it's the best available proxy.
 *
 * Crucially, this proxy does NOT affect correctness of the two things that
 * matter: END-OF-DAY balance and SUSPECT flags both depend only on the SUM of
 * a day's movements, which is order-independent. Intra-day order only changes
 * the cosmetic per-row "running balance" shown in tooltips/table mid-day. So
 * even if the proxy mis-orders two same-day rows, the negativity analysis is
 * unaffected.
 */

export type TranType = 'IR' | 'IF' | 'IT' | 'BUILD' | 'UNBUILD' | 'ADJ' | 'BILL';

export interface LedgerTxn {
  id: string; // stable row id (DB uuid, or synthetic in tests)
  nsTransactionId: string; // NS transaction internal id — pairs transfer legs
  lineId: string;
  docNumber: string;
  tranDate: string; // ISO yyyy-mm-dd
  tranType: TranType;
  locationNsId: string;
  locationName: string;
  signedQty: number; // +inbound / -outbound at this location
  transferGroup?: string | null;
  transferLeg?: 'source' | 'dest' | null;
  memo?: string;
  nsType?: string | null; // NetSuite type DISPLAY name (e.g. "Inventory Transfer") — UI only
  nsTypeCode?: string | null; // RAW NetSuite type code (e.g. "InvTrnfr") — drives editability; engine ignores it
  subsidiaryName?: string | null; // owning subsidiary — for intercompany detection / broken-chain checks
  // Intercompany TOrdCost linkage (engine ignores; chains.ts uses it):
  chainPartnerTxId?: string | null; // the paired IF/IR transaction internal id
  chainRole?: 'if' | 'ir' | null;
}

export interface OpeningBalance {
  locationNsId: string;
  locationName: string;
  openingQty: number;
  currentQoh?: number;
}

export interface AnnotatedTxn extends LedgerTxn {
  runningBalance: number; // balance at this location immediately after this row
  suspect: boolean;
}

export interface EodPoint {
  date: string;
  eod: number; // end-of-day balance at this location
  priorEod: number; // balance carried INTO this day (eod of previous active day, or opening)
}

export interface LocationLedger {
  locationNsId: string;
  locationName: string;
  opening: number;
  rows: AnnotatedTxn[];
  eodTimeline: EodPoint[];
  final: number; // final running balance (= currentQoh by construction of opening)
  /** Snapshot-to-snapshot spans whose forward replay failed to reconcile to the
   *  trusted snapshot (empty if all verified or no dated snapshots supplied). */
  unverifiedSegments: UnverifiedSegment[];
  /** Dates of trusted correction points applied to this lane (sorted asc).
   *  A window starting on/after one of these is anchored by trusted truth. */
  correctionDates: string[];
}

/** A span between two trusted snapshots whose forward replay did NOT reconcile
 *  to the later snapshot — NetSuite has movements we can't see here, so any
 *  balance shown inside it is approximate. `gap` = trusted − reconstructed. */
export interface UnverifiedSegment {
  from: string; // previous anchor date (exclusive) — or first activity if none
  to: string; // the snapshot date where the mismatch was detected
  gap: number;
}

/** Trusted re-anchor points per location id: date → on-hand at end of that date.
 *  When supplied to computeLedger, the running balance is corrected to the
 *  trusted value at each date (and the pre-correction gap is recorded). */
export type Correction = { date: string; qty: number };
export type CorrectionMap = Map<string, Correction[]>; // locationNsId → sorted corrections

export interface Ledger {
  byLocation: Record<string, LocationLedger>;
  suspectRowIds: Set<string>;
}

export interface NegativeSpan {
  from: string; // first date end-of-day went negative
  to: string | null; // date it recovered (eod >= 0), or null if still negative at end
  depth: number; // most-negative eod within the span
}

export interface LocationNegative {
  locationNsId: string;
  locationName: string;
  deepestBalance: number; // most negative eod ever (< 0)
  deepestDate: string;
  spans: NegativeSpan[];
}

/** Only locations that go negative at some end-of-day are present. */
export type NegativeSummary = Record<string, LocationNegative>;

export type SimChange =
  | { kind: 'changeDate'; nsTransactionId: string; newDate: string }
  | { kind: 'changeQty'; nsTransactionId: string; newQty: number } // newQty = MAGNITUDE; sign preserved per leg
  | { kind: 'delete'; nsTransactionId: string }
  // Invent a brand-new inventory transfer (Part A). Appends two synthetic legs.
  | {
      kind: 'createTransfer';
      source: string;
      sourceName?: string;
      dest: string;
      destName?: string;
      qty: number;
      date: string;
    };

export interface SimDelta {
  fixed: { locationNsId: string; locationName: string; wasDepth: number }[];
  stillNegative: {
    locationNsId: string;
    locationName: string;
    wasDepth: number;
    nowDepth: number;
  }[];
  newProblem: {
    locationNsId: string;
    locationName: string;
    depth: number;
    spans: NegativeSpan[];
  }[];
}

export interface SimResult {
  current: NegativeSummary;
  after: NegativeSummary;
  delta: SimDelta;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------
function cmp(a: string | number, b: string | number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Canonical order: date ASC, then ns transaction id ASC, then line id ASC.
 *  Numeric ids are compared numerically when both parse as numbers. */
export function sortTxns(txns: LedgerTxn[]): LedgerTxn[] {
  const numOrStr = (s: string): string | number => {
    const n = Number(s);
    return Number.isFinite(n) && s.trim() !== '' ? n : s;
  };
  return [...txns].sort(
    (a, b) =>
      cmp(a.tranDate, b.tranDate) ||
      cmp(numOrStr(a.nsTransactionId), numOrStr(b.nsTransactionId)) ||
      cmp(numOrStr(a.lineId), numOrStr(b.lineId)),
  );
}

// ---------------------------------------------------------------------------
// Ledger build + suspect detection
// ---------------------------------------------------------------------------

/**
 * Build per-location running balances, end-of-day timelines, and suspect flags.
 *
 * SUSPECT RULE (per spec): an outbound row (signedQty < 0) at a location is
 * suspect iff that location's END-OF-DAY balance on the row's date is < 0 AND
 *   (a) the prior active day's end-of-day was >= 0 (this day drove it negative), OR
 *   (b) the prior day was already negative AND today's eod is MORE negative
 *       (this day deepened it).
 * (a) and (b) unify to: eod(day) < 0 AND eod(day) < priorEod. On such a
 * "problem day", every outbound row that day is flagged.
 */
export function computeLedger(
  txns: LedgerTxn[],
  openings: OpeningBalance[],
  corrections?: CorrectionMap,
): Ledger {
  const openingByLoc = new Map<string, OpeningBalance>();
  for (const o of openings) openingByLoc.set(o.locationNsId, o);

  // Group rows by location.
  const byLoc = new Map<string, LedgerTxn[]>();
  for (const t of txns) {
    if (!byLoc.has(t.locationNsId)) byLoc.set(t.locationNsId, []);
    byLoc.get(t.locationNsId)!.push(t);
  }
  // Make sure locations that only have an opening (no rows) still appear.
  for (const o of openings) if (!byLoc.has(o.locationNsId)) byLoc.set(o.locationNsId, []);
  // …and locations that only have correction points.
  if (corrections) for (const locId of corrections.keys()) if (!byLoc.has(locId)) byLoc.set(locId, []);

  const result: Ledger = { byLocation: {}, suspectRowIds: new Set() };

  for (const [locId, locRows] of byLoc) {
    const sorted = sortTxns(locRows);
    const opening = openingByLoc.get(locId)?.openingQty ?? 0;
    const locationName =
      openingByLoc.get(locId)?.locationName || sorted[0]?.locationName || locId;
    const corr = corrections?.get(locId) ?? [];

    const annotated: AnnotatedTxn[] = [];
    const eodTimeline: EodPoint[] = [];
    const unverifiedSegments: UnverifiedSegment[] = [];
    let running = opening;
    let priorEod = opening;
    let i = 0;
    let ci = 0;
    // "from" anchor for the next correction segment (last trusted point we held);
    // set to the first event date lazily on the first iteration.
    let prevAnchor = '';

    // Walk the merged stream of transaction dates and correction dates.
    while (i < sorted.length || ci < corr.length) {
      const txnDate = i < sorted.length ? sorted[i].tranDate : null;
      const corrDate = ci < corr.length ? corr[ci].date : null;
      const date =
        txnDate !== null && (corrDate === null || txnDate <= corrDate) ? txnDate : corrDate!;
      if (prevAnchor === '') prevAnchor = date;

      const bucket: AnnotatedTxn[] = [];
      while (i < sorted.length && sorted[i].tranDate === date) {
        running += sorted[i].signedQty;
        const row: AnnotatedTxn = { ...sorted[i], runningBalance: running, suspect: false };
        bucket.push(row);
        annotated.push(row);
        i++;
      }
      let eod = running;

      // Trusted snapshot on this date → validate the span since the last anchor,
      // then re-anchor the running balance to the trusted value.
      if (corrDate === date) {
        const trusted = corr[ci].qty;
        const gap = Math.round((trusted - eod) * 100) / 100;
        if (gap !== 0) unverifiedSegments.push({ from: prevAnchor, to: date, gap });
        running = trusted;
        eod = trusted;
        prevAnchor = date;
        ci++;
      }

      const problemDay = eod < 0 && eod < priorEod;
      if (problemDay) {
        for (const row of bucket) {
          if (row.signedQty < 0) {
            row.suspect = true;
            result.suspectRowIds.add(row.id);
          }
        }
      }
      eodTimeline.push({ date, eod, priorEod });
      priorEod = eod;
    }

    result.byLocation[locId] = {
      locationNsId: locId,
      locationName,
      opening,
      rows: annotated,
      eodTimeline,
      final: running,
      unverifiedSegments,
      correctionDates: corr.map((c) => c.date),
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Negative summary
// ---------------------------------------------------------------------------

/** Summarize every location that goes negative at any end-of-day. */
export function summarizeNegatives(ledger: Ledger): NegativeSummary {
  const summary: NegativeSummary = {};

  for (const loc of Object.values(ledger.byLocation)) {
    const tl = loc.eodTimeline;
    if (tl.length === 0) continue;

    let deepestBalance = 0;
    let deepestDate = '';
    const spans: NegativeSpan[] = [];

    let spanFrom: string | null = null;
    let spanDepth = 0;

    for (let k = 0; k < tl.length; k++) {
      const { date, eod } = tl[k];
      if (eod < 0) {
        if (spanFrom === null) {
          spanFrom = date;
          spanDepth = eod;
        } else {
          spanDepth = Math.min(spanDepth, eod);
        }
        if (eod < deepestBalance) {
          deepestBalance = eod;
          deepestDate = date;
        }
      } else if (spanFrom !== null) {
        // Recovered on this date.
        spans.push({ from: spanFrom, to: date, depth: spanDepth });
        spanFrom = null;
      }
    }
    // Span still open at end of history → ongoing (to = null).
    if (spanFrom !== null) spans.push({ from: spanFrom, to: null, depth: spanDepth });

    if (deepestBalance < 0) {
      summary[loc.locationNsId] = {
        locationNsId: loc.locationNsId,
        locationName: loc.locationName,
        deepestBalance,
        deepestDate,
        spans,
      };
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/**
 * Apply a proposed change to a COPY of the rows. Operates on ALL rows sharing
 * the target nsTransactionId, which automatically covers both legs of an
 * Inventory Transfer (they share the same NS transaction id) — one logical
 * event, changed atomically.
 *
 * changeQty's newQty is treated as a MAGNITUDE; each affected row keeps its
 * original direction (source leg stays negative, destination leg stays
 * positive, a lone outbound line stays outbound).
 */
export function applyChange(txns: LedgerTxn[], change: SimChange): LedgerTxn[] {
  switch (change.kind) {
    case 'delete':
      return txns.filter((t) => t.nsTransactionId !== change.nsTransactionId);
    case 'changeDate':
      return txns.map((t) =>
        t.nsTransactionId === change.nsTransactionId ? { ...t, tranDate: change.newDate } : t,
      );
    case 'changeQty': {
      const mag = Math.abs(change.newQty);
      return txns.map((t) => {
        if (t.nsTransactionId !== change.nsTransactionId) return t;
        const sign = t.signedQty < 0 ? -1 : 1;
        return { ...t, signedQty: sign * mag };
      });
    }
    case 'createTransfer': {
      const id = `NEW-${change.source}->${change.dest}@${change.date}`;
      const q = Math.abs(change.qty);
      const leg = (
        loc: string,
        name: string | undefined,
        signedQty: number,
        which: 'source' | 'dest',
        lineId: string,
      ): LedgerTxn => ({
        id: `${id}-${which}`,
        nsTransactionId: id,
        lineId,
        docNumber: '(new transfer)',
        tranDate: change.date,
        tranType: 'IT',
        nsType: 'Inventory Transfer',
        nsTypeCode: 'InvTrnfr',
        locationNsId: loc,
        locationName: name ?? loc,
        signedQty,
        transferGroup: id,
        transferLeg: which,
      });
      return [
        ...txns,
        leg(change.source, change.sourceName, -q, 'source', '1'),
        leg(change.dest, change.destName, q, 'dest', '2'),
      ];
    }
  }
}

/** Fold a list of changes left-to-right. Used for multi-document edits — an
 *  intercompany chain (move both IF and IR), or a primary fix + its upstream
 *  prerequisite — applied as one atomic set. */
export function applyChanges(txns: LedgerTxn[], changes: SimChange[]): LedgerTxn[] {
  return changes.reduce((acc, c) => applyChange(acc, c), txns);
}

/**
 * Simulate a change and return current vs. after negative-summaries plus an
 * explicit delta (FIXED / STILL_NEGATIVE / NEW PROBLEM).
 *
 * Opening balances are held FIXED — they represent pre-window inventory truth
 * (current QOH minus all pulled movements) and don't change just because we
 * hypothetically edit a transaction. So the simulation shows the corrected
 * balance trajectory; the final balance after the fix legitimately differs
 * from today's QOH (that's the whole point).
 */
export function simulate(
  txns: LedgerTxn[],
  openings: OpeningBalance[],
  change: SimChange,
  corrections?: CorrectionMap,
): SimResult {
  return simulateMany(txns, openings, [change], corrections);
}

/** Multi-change variant — applies all changes together, then diffs. */
export function simulateMany(
  txns: LedgerTxn[],
  openings: OpeningBalance[],
  changes: SimChange[],
  corrections?: CorrectionMap,
): SimResult {
  const current = summarizeNegatives(computeLedger(txns, openings, corrections));
  const after = summarizeNegatives(computeLedger(applyChanges(txns, changes), openings, corrections));

  const delta: SimDelta = { fixed: [], stillNegative: [], newProblem: [] };
  const locIds = new Set([...Object.keys(current), ...Object.keys(after)]);

  for (const loc of locIds) {
    const cur = current[loc];
    const aft = after[loc];
    if (cur && !aft) {
      delta.fixed.push({
        locationNsId: loc,
        locationName: cur.locationName,
        wasDepth: cur.deepestBalance,
      });
    } else if (cur && aft) {
      delta.stillNegative.push({
        locationNsId: loc,
        locationName: aft.locationName,
        wasDepth: cur.deepestBalance,
        nowDepth: aft.deepestBalance,
      });
    } else if (!cur && aft) {
      delta.newProblem.push({
        locationNsId: loc,
        locationName: aft.locationName,
        depth: aft.deepestBalance,
        spans: aft.spans,
      });
    }
  }

  return { current, after, delta };
}
