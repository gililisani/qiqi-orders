/**
 * Reconcile the engine's reconstructed worklist against the TRUSTED NetSuite
 * web-query feed (lib/inventory/webQuery.ts). Pure — no I/O.
 *
 * WHY: balance reconstruction can NOT be made to match NetSuite's consolidated
 * on-hand (phantom movements the API can't see — proven, see memory). So we let
 * the engine do what it's good at (time-dimension analysis + fix planning) but
 * make the FEED authoritative for the one thing reconstruction gets wrong: what
 * is negative RIGHT NOW and by how much.
 *
 * For each ONGOING engine negative (one whose window is still open):
 *   - feed says negative too  → CONFIRMED. Trust the feed's depth (fixes the
 *     "wrong Depth" bug); keep the engine's fix recommendation.
 *   - feed says >= 0 now      → FALSE POSITIVE. Drop it — a reconstruction
 *     artifact, the location isn't actually negative.
 *   - feed has no row for it   → UNMATCHED. Keep but flag (location-name mapping
 *     gap, or item not in the report) — never silently hide a possible negative.
 * Feed negatives with no matching ongoing engine row → FEED_ONLY: surface a
 * MANUAL row so a real negative is never lost just because the engine missed it.
 *
 * Closed / historical rows are left untouched — the feed only speaks to NOW.
 */
import type { WorklistRow } from '@/lib/inventory/worklist';
import type { StockRow } from '@/lib/inventory/webQuery';

/** Tolerant location-name normalization (the owner's rule: never strict-equal
 *  domain text). Lowercases and reduces to alphanumeric tokens, so
 *  "Packable - Qiqi GLOBAL" and "packable  qiqi global" collapse to one key. */
export function normalizeLocationName(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Reconciliation key for an (item, location) pair. */
export function reconcileKey(itemCode: string, location: string): string {
  return `${(itemCode ?? '').trim().toUpperCase()}|${normalizeLocationName(location)}`;
}

function appendNote(existing: string, add: string): string {
  return existing && existing.trim() ? `${existing.trim()} ${add}` : add;
}

export interface ReconcileSummary {
  confirmed: number; // engine ongoing-negative AND feed negative
  falsePositive: number; // engine ongoing-negative but feed >= 0 now → dropped
  feedOnly: number; // feed negative but engine had no ongoing row → surfaced
  unmatched: number; // engine ongoing-negative but feed has no row for it → kept + flagged
}

export interface ReconcileOptions {
  rows: WorklistRow[];
  /** True if this row is an OPEN/ongoing negative (the only kind the feed can judge). */
  isOngoing: (row: WorklistRow) => boolean;
  /** Full feed (every (item, location) with a value — negatives AND non-negatives). */
  feed: StockRow[];
  /** Construct a MANUAL worklist row for a feed-only negative. */
  buildFeedOnlyRow: (neg: StockRow) => WorklistRow;
}

export interface ReconcileResult {
  rows: WorklistRow[];
  summary: ReconcileSummary;
  falsePositives: { itemCode: string; locationName: string; engineDepth: number }[];
  unmatchedEngine: { itemCode: string; locationName: string; engineDepth: number }[];
  feedOnly: StockRow[];
}

export function reconcileWorklistWithFeed(opts: ReconcileOptions): ReconcileResult {
  // key → qoh, across the WHOLE feed (so we can tell "non-negative now" apart
  // from "not in the feed at all").
  const feedByKey = new Map<string, number>();
  for (const f of opts.feed) feedByKey.set(reconcileKey(f.itemCode, f.location), f.qoh);

  const out: WorklistRow[] = [];
  const summary: ReconcileSummary = { confirmed: 0, falsePositive: 0, feedOnly: 0, unmatched: 0 };
  const falsePositives: ReconcileResult['falsePositives'] = [];
  const unmatchedEngine: ReconcileResult['unmatchedEngine'] = [];
  const consumed = new Set<string>(); // feed keys claimed by an ongoing engine row

  for (const row of opts.rows) {
    if (!opts.isOngoing(row)) {
      out.push(row); // closed / historical — feed can't speak to the past
      continue;
    }
    const key = reconcileKey(row.itemCode, row.locationName);
    const fq = feedByKey.get(key);

    if (fq === undefined) {
      summary.unmatched++;
      unmatchedEngine.push({ itemCode: row.itemCode, locationName: row.locationName, engineDepth: row.depth });
      out.push({
        ...row,
        feedStatus: 'unmatched',
        notes: appendNote(row.notes, '⚠ Not found in the trusted NetSuite report — verify location-name mapping.'),
      });
    } else if (fq < 0) {
      summary.confirmed++;
      consumed.add(key);
      out.push({
        ...row,
        feedStatus: 'confirmed',
        depth: fq, // trusted current on-hand from the report
        notes: appendNote(row.notes, `Current on-hand ${fq} confirmed by the NetSuite report.`),
      });
    } else {
      // Feed says this location is NOT negative now — reconstruction artifact.
      summary.falsePositive++;
      consumed.add(key);
      falsePositives.push({ itemCode: row.itemCode, locationName: row.locationName, engineDepth: row.depth });
      // dropped (not pushed)
    }
  }

  // Feed negatives the engine never produced an ongoing row for.
  const feedOnly: StockRow[] = [];
  for (const f of opts.feed) {
    if (f.qoh >= 0) continue;
    const key = reconcileKey(f.itemCode, f.location);
    if (consumed.has(key)) continue;
    feedOnly.push(f);
    summary.feedOnly++;
    out.push(opts.buildFeedOnlyRow(f));
  }

  return { rows: out, summary, falsePositives, unmatchedEngine, feedOnly };
}
