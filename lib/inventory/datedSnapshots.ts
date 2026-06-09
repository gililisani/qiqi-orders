/**
 * Dated trusted-snapshot store. SERVER-ONLY.
 *
 * Each capture stores the full NetSuite report feed (item, location, qoh) tagged
 * with the as-of date the owner had the report set to. The balance engine uses
 * these as anchors: opening = earliest snapshot, then re-anchor + validate at
 * every later snapshot. See migration 20260609140000.
 */
import { createServiceRoleClient } from '@/platform/auth/guards';
import type { StockRow } from '@/lib/inventory/webQuery';
import type { OpeningAnchor } from '@/lib/inventory/assemble';

export interface SnapshotDateInfo {
  asOfDate: string;
  rowCount: number;
  capturedAt: string | null;
}

/** Per-item anchor data: location name → (date → qty), plus the sorted dates. */
export interface ItemSnapshots {
  dates: string[]; // all captured dates (sorted asc), global across the report
  byLoc: Map<string, Map<string, number>>; // locationName → (asOfDate → qoh)
}

/** Replace the snapshot for one as-of date with the given feed rows. */
export async function captureSnapshot(asOfDate: string, rows: StockRow[]): Promise<number> {
  const sb = createServiceRoleClient();
  await sb.from('inv_inv_dated_snapshots').delete().eq('as_of_date', asOfDate);
  const now = new Date().toISOString();
  const payload = rows.map((r) => ({
    as_of_date: asOfDate,
    item_code: r.itemCode,
    location_name: r.location,
    qoh: r.qoh,
    captured_at: now,
  }));
  const CHUNK = 500;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error } = await sb.from('inv_inv_dated_snapshots').insert(payload.slice(i, i + CHUNK));
    if (error) throw new Error(`dated snapshot insert: ${error.message}`);
  }
  return payload.length;
}

export async function deleteSnapshot(asOfDate: string): Promise<void> {
  const sb = createServiceRoleClient();
  const { error } = await sb.from('inv_inv_dated_snapshots').delete().eq('as_of_date', asOfDate);
  if (error) throw new Error(error.message);
}

/** All captured dates with row counts (most recent first). */
export async function listSnapshotDates(): Promise<SnapshotDateInfo[]> {
  const sb = createServiceRoleClient();
  // Pull just the columns we need and aggregate in JS (Supabase has no GROUP BY).
  const { data, error } = await sb
    .from('inv_inv_dated_snapshots')
    .select('as_of_date, captured_at');
  if (error) throw new Error(error.message);
  const byDate = new Map<string, { count: number; capturedAt: string | null }>();
  for (const r of data ?? []) {
    const e = byDate.get(r.as_of_date) ?? { count: 0, capturedAt: null };
    e.count++;
    if (!e.capturedAt || (r.captured_at && r.captured_at > e.capturedAt)) e.capturedAt = r.captured_at;
    byDate.set(r.as_of_date, e);
  }
  return [...byDate.entries()]
    .map(([asOfDate, v]) => ({ asOfDate, rowCount: v.count, capturedAt: v.capturedAt }))
    .sort((a, b) => (a.asOfDate < b.asOfDate ? 1 : -1));
}

/**
 * Build the balance-engine opening anchor from an item's dated snapshots:
 * opening = earliest captured date; later dates become re-anchor corrections.
 * Returns undefined if the item has no snapshots.
 */
export function buildDatedAnchor(item: ItemSnapshots | undefined): OpeningAnchor | undefined {
  if (!item || item.dates.length === 0) return undefined;
  const cutoff = item.dates[0];
  const openingByLocName = new Map<string, number>();
  const correctionsByLocName = new Map<string, Map<string, number>>();
  for (const [loc, dateQty] of item.byLoc) {
    openingByLocName.set(loc, dateQty.get(cutoff) ?? 0);
    const later = new Map<string, number>();
    for (const [d, q] of dateQty) if (d > cutoff) later.set(d, q);
    if (later.size) correctionsByLocName.set(loc, later);
  }
  return { cutoffDate: cutoff, openingByLocName, correctionsByLocName };
}

/** Dated snapshots for a single item (UPPER-cased code). null if none. */
export async function readItemSnapshots(itemCode: string): Promise<ItemSnapshots | null> {
  const sb = createServiceRoleClient();
  const code = itemCode.toUpperCase();
  const { data, error } = await sb
    .from('inv_inv_dated_snapshots')
    .select('as_of_date, location_name, qoh')
    .eq('item_code', code);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  const dates = [...new Set(data.map((r) => r.as_of_date))].sort();
  const byLoc = new Map<string, Map<string, number>>();
  for (const r of data) {
    let loc = byLoc.get(r.location_name);
    if (!loc) {
      loc = new Map();
      byLoc.set(r.location_name, loc);
    }
    loc.set(r.as_of_date, Number(r.qoh));
  }
  return { dates, byLoc };
}

/**
 * Load all dated snapshots grouped by item code. Returns a per-item accessor
 * map keyed by UPPERCASED item code. The `dates` list is the global set of
 * captured dates (every location is anchored/validated against the same dates).
 */
export async function readAllDatedSnapshots(): Promise<Map<string, ItemSnapshots>> {
  const sb = createServiceRoleClient();
  // Page through — the table can be large (≈500 rows × N dates).
  const PAGE = 1000;
  let from = 0;
  const all: { as_of_date: string; item_code: string; location_name: string; qoh: number }[] = [];
  for (;;) {
    const { data, error } = await sb
      .from('inv_inv_dated_snapshots')
      .select('as_of_date, item_code, location_name, qoh')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const allDates = [...new Set(all.map((r) => r.as_of_date))].sort();
  const byItem = new Map<string, ItemSnapshots>();
  for (const r of all) {
    const code = r.item_code.toUpperCase();
    let item = byItem.get(code);
    if (!item) {
      item = { dates: allDates, byLoc: new Map() };
      byItem.set(code, item);
    }
    let loc = item.byLoc.get(r.location_name);
    if (!loc) {
      loc = new Map();
      item.byLoc.set(r.location_name, loc);
    }
    loc.set(r.as_of_date, Number(r.qoh));
  }
  return byItem;
}
