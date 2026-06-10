/**
 * TODAY-anchor — the dynamic anchoring model. Pure — no I/O.
 *
 * Anchor each (item, location) on TODAY's trusted on-hand (from the web-query
 * feed) and let the delta replay place history backward from it:
 *
 *   opening = todayQoh − Σ(visible transactions dated ≤ today)
 *
 * so the replayed end-of-day balance lands EXACTLY on the trusted number today.
 * Because the feed is fetched fresh on every recompute, the whole history
 * self-heals after every fix the owner makes in NetSuite — nothing stored,
 * nothing to re-capture (the failure mode that killed snapshot anchoring).
 *
 * Honesty rule: if opening ≠ 0, the visible transactions do NOT fully explain
 * today's balance — there's a residual somewhere in time that backward replay
 * places at the very beginning (which may be wrong, e.g. a late phantom).
 * Windows in such lanes stay "approximate" until a TRUSTED POINT (a dated
 * balance read from NetSuite's Review Negative Inventory page) anchors them.
 */
import type { LedgerTxn, OpeningBalance, CorrectionMap } from '@/lib/inventory/balanceEngine';
import { normalizeLocationName } from '@/lib/inventory/feedReconcile';
import type { StockRow } from '@/lib/inventory/webQuery';

export interface TrustedPoint {
  itemCode: string;
  locationName: string;
  asOfDate: string; // ISO yyyy-mm-dd
  qty: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rebuild the openings so every location's replay lands on today's trusted
 * on-hand. `feedQohByLocName` holds the feed rows for THIS item (location name
 * → qoh); a location missing from the feed is treated as 0 on-hand today.
 * Feed locations with no transactions at all still get a lane (synthetic id =
 * location name) so a feed-negative there is never dropped.
 */
export function applyTodayAnchor(
  transactions: LedgerTxn[],
  openings: OpeningBalance[],
  feedQohByLocName: Map<string, number>,
  todayIso: string,
): OpeningBalance[] {
  // Tolerant name lookup for the feed (owner rule: never strict-equal text).
  const feedByNorm = new Map<string, number>();
  for (const [name, qoh] of feedQohByLocName) feedByNorm.set(normalizeLocationName(name), qoh);

  const sumByLoc = new Map<string, number>();
  const nameByLoc = new Map<string, string>();
  for (const t of transactions) {
    nameByLoc.set(t.locationNsId, t.locationName);
    if (t.tranDate <= todayIso) {
      sumByLoc.set(t.locationNsId, (sumByLoc.get(t.locationNsId) ?? 0) + t.signedQty);
    }
  }
  for (const o of openings) if (!nameByLoc.has(o.locationNsId)) nameByLoc.set(o.locationNsId, o.locationName);

  const out: OpeningBalance[] = [];
  const matchedNorms = new Set<string>();
  for (const [locId, locName] of nameByLoc) {
    const norm = normalizeLocationName(locName);
    const qoh = feedByNorm.get(norm) ?? 0;
    matchedNorms.add(norm);
    out.push({
      locationNsId: locId,
      locationName: locName,
      openingQty: round2(qoh - (sumByLoc.get(locId) ?? 0)),
      currentQoh: qoh,
    });
  }
  // Feed locations with zero transaction history (lane = opening only).
  for (const [name, qoh] of feedQohByLocName) {
    if (matchedNorms.has(normalizeLocationName(name))) continue;
    out.push({ locationNsId: name, locationName: name, openingQty: round2(qoh), currentQoh: qoh });
  }
  return out;
}

/**
 * Convert trusted points (keyed by location NAME) into the engine's
 * CorrectionMap (keyed by location ns id), resolving names tolerantly against
 * the item's known locations. Points for unknown locations fall back to a
 * synthetic name-id lane (consistent with applyTodayAnchor).
 */
export function buildPointCorrections(
  points: TrustedPoint[],
  transactions: LedgerTxn[],
  openings: OpeningBalance[],
): CorrectionMap {
  const idByNorm = new Map<string, string>();
  for (const o of openings) idByNorm.set(normalizeLocationName(o.locationName), o.locationNsId);
  for (const t of transactions) idByNorm.set(normalizeLocationName(t.locationName), t.locationNsId);

  const byLoc: CorrectionMap = new Map();
  for (const p of points) {
    const locId = idByNorm.get(normalizeLocationName(p.locationName)) ?? p.locationName;
    const arr = byLoc.get(locId) ?? byLoc.set(locId, []).get(locId)!;
    arr.push({ date: p.asOfDate, qty: p.qty });
  }
  for (const arr of byLoc.values()) arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return byLoc;
}

/** Feed rows for one item → location name → qoh. */
export function feedQohForItem(feed: StockRow[], itemCode: string): Map<string, number> {
  const code = itemCode.trim().toUpperCase();
  const m = new Map<string, number>();
  for (const r of feed) if (r.itemCode.trim().toUpperCase() === code) m.set(r.location, r.qoh);
  return m;
}
