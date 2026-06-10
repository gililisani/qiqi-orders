/**
 * Negative-window detection + tiering. Pure — no I/O.
 *
 * A "negative window" is a contiguous stretch where a location's END-OF-DAY
 * balance stays < 0. This is the shared primitive behind both the Negatives
 * History view (lists every window) and the worklist (borrows each location's
 * ongoing-window tier).
 *
 * TIERS (Part B):
 *   1 TOXIC       — ongoing window with >=1 Assembly Build consuming the item
 *                   here while negative (bad cost flowed into finished goods).
 *   2 COMPOUNDING — ongoing, no builds, but >=1 other outbound (IT-out / IF /
 *                   qty-reducing InvAdjst) while negative (each is a mis-costing).
 *   3 DORMANT     — ongoing, no outbound activity after going negative.
 *   4 HISTORICAL  — any CLOSED window (recovered). Damage is frozen.
 */
import type { Ledger, LocationLedger } from '@/lib/inventory/balanceEngine';

// Kept in sync with worklist.ts CLOSED_PERIOD_CUTOFF (defined locally to avoid a
// circular import, since worklist imports computeItemWindows from here).
const CLOSED_PERIOD_CUTOFF = '2024-01-01';

export type Tier = 1 | 2 | 3 | 4;

export interface NegativeWindow {
  itemCode: string;
  nsItemId: string | null;
  itemName: string | null;
  locationNsId: string;
  locationName: string;
  start: string;
  end: string | null; // null = ongoing
  minBalance: number;
  durationDays: number;
  buildsDuring: number;
  otherOutboundDuring: number;
  status: 'Ongoing' | 'Closed';
  crossedClosedPeriod: boolean;
  tier: Tier;
  /** Trust against the dated trusted snapshots:
   *  true  = window sits entirely within snapshot-to-snapshot spans that
   *          reconciled (numbers are trustworthy);
   *  false = overlaps a span NetSuite couldn't reconcile (approximate);
   *  undefined = not evaluated (no dated snapshots covered this item). */
  verified?: boolean;
}

export interface WindowItemMeta {
  itemCode: string;
  nsItemId: string | null;
  itemName: string | null;
}

// Raw NS type codes counted as "other outbound" while negative (not builds).
const OTHER_OUTBOUND = new Set(['InvTrnfr', 'ItemShip', 'InvAdjst']);

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86400000));
}

function buildWindow(
  lane: LocationLedger,
  start: string,
  end: string | null,
  minBalance: number,
  dateMax: string,
  meta: WindowItemMeta,
): NegativeWindow {
  const status: 'Ongoing' | 'Closed' = end === null ? 'Ongoing' : 'Closed';
  const inWindow = (d: string) => d >= start && (end === null || d < end);

  let buildsDuring = 0;
  let otherOutboundDuring = 0;
  for (const r of lane.rows) {
    if (r.signedQty >= 0 || !inWindow(r.tranDate)) continue;
    if (r.nsTypeCode === 'Build') buildsDuring++;
    else if (r.nsTypeCode && OTHER_OUTBOUND.has(r.nsTypeCode)) otherOutboundDuring++;
  }

  const endRef = end ?? dateMax ?? start;
  const durationDays = daysBetween(start, endRef);
  const crossedClosedPeriod =
    start < CLOSED_PERIOD_CUTOFF || start.slice(0, 4) !== endRef.slice(0, 4);

  let tier: Tier;
  if (status === 'Closed') tier = 4;
  else if (buildsDuring > 0) tier = 1;
  else if (otherOutboundDuring > 0) tier = 2;
  else tier = 3;

  return {
    itemCode: meta.itemCode,
    nsItemId: meta.nsItemId,
    itemName: meta.itemName,
    locationNsId: lane.locationNsId,
    locationName: lane.locationName,
    start,
    end,
    minBalance,
    durationDays,
    buildsDuring,
    otherOutboundDuring,
    status,
    crossedClosedPeriod,
    tier,
  };
}

/** Is the lane anchored by trusted truth at/before this date? True when the
 *  visible transactions fully explain today's balance (opening ≈ 0 under the
 *  today-anchor), or a trusted correction point sits on/before the date. */
export function laneAnchoredBefore(lane: LocationLedger, date: string): boolean {
  if (Math.abs(lane.opening) < 0.005) return true;
  return (lane.correctionDates ?? []).some((d) => d <= date);
}

/** Is a window [start, end) trustworthy?
 *  - undefined when no trusted anchor was applied at all (can't judge);
 *  - false when the lane has an unexplained opening with no trusted point on/
 *    before the window start (the residual could sit anywhere in time), or the
 *    window overlaps a span where a trusted point failed to reconcile;
 *  - true otherwise. */
function windowVerified(
  lane: LocationLedger,
  start: string,
  end: string | null,
  trustedAnchorApplied: boolean,
): boolean | undefined {
  if (!trustedAnchorApplied) return undefined;
  const endRef = end ?? '9999-12-31';
  const overlaps = (lane.unverifiedSegments ?? []).some((seg) => seg.to >= start && seg.from <= endRef);
  return !overlaps && laneAnchoredBefore(lane, start);
}

/** Every negative window for an item, across all locations. */
export function computeItemWindows(
  meta: WindowItemMeta,
  ledger: Ledger,
  opts?: { snapshotsApplied?: boolean },
): NegativeWindow[] {
  const snapshotsApplied = opts?.snapshotsApplied ?? false;
  // Latest date in the item's data (for ongoing-window duration / year-cross).
  let dateMax = '';
  for (const lane of Object.values(ledger.byLocation)) {
    for (const r of lane.rows) if (r.tranDate > dateMax) dateMax = r.tranDate;
  }

  const out: NegativeWindow[] = [];
  for (const lane of Object.values(ledger.byLocation)) {
    let inW = false;
    let start = '';
    let min = 0;
    const emit = (end: string | null) => {
      const w = buildWindow(lane, start, end, min, dateMax, meta);
      w.verified = windowVerified(lane, start, end, snapshotsApplied);
      out.push(w);
    };
    for (const p of lane.eodTimeline) {
      if (p.eod < 0) {
        if (!inW) {
          inW = true;
          start = p.date;
          min = p.eod;
        } else {
          min = Math.min(min, p.eod);
        }
      } else if (inW) {
        emit(p.date);
        inW = false;
      }
    }
    if (inW) emit(null);
  }
  return out;
}
