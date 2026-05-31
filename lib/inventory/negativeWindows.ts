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

/** Every negative window for an item, across all locations. */
export function computeItemWindows(meta: WindowItemMeta, ledger: Ledger): NegativeWindow[] {
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
        out.push(buildWindow(lane, start, p.date, min, dateMax, meta));
        inW = false;
      }
    }
    if (inW) out.push(buildWindow(lane, start, null, min, dateMax, meta));
  }
  return out;
}
