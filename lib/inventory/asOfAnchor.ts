/**
 * As-of-date opening anchor sourced from the NetSuite RESTlet. SERVER-ONLY.
 *
 * When the RESTlet is deployed + configured, this gives NetSuite's OWN measured
 * on-hand per (item, location) as of the cutoff — the authoritative opening that
 * eliminates the reconstruction residual (the FPS0017 −22 problem). It returns
 * the same shape the CSV snapshot importer produces (OpeningLookup), so the rest
 * of the engine is unchanged: only the SOURCE of the opening differs.
 *
 * Falls back to the uploaded CSV snapshot when the RESTlet isn't configured.
 */
import { createNetSuiteAPI } from '@/lib/netsuite';
import { openingKey, readSnapshotLookup, type OpeningLookup } from '@/lib/inventory/openingSnapshot';

export const DEFAULT_CUTOFF = '2023-12-31';

export interface AnchorSource {
  lookup: OpeningLookup;
  cutoffDate: string | null;
  source: 'restlet' | 'csv' | 'none';
}

/**
 * Resolve the opening anchor. Prefers the RESTlet (live, measured, no uploads);
 * falls back to the uploaded CSV snapshot; else none (engine zero-anchors).
 */
export async function resolveOpeningAnchor(cutoff = DEFAULT_CUTOFF): Promise<AnchorSource> {
  const ns = createNetSuiteAPI();
  if (ns.isAsOfConfigured()) {
    try {
      const { asOfDate, rows } = await ns.getInventoryAsOf(cutoff);
      const lookup: OpeningLookup = new Map();
      for (const r of rows) {
        if (!r.itemCode || !r.locationName) continue;
        lookup.set(openingKey(r.itemCode, r.locationName), Number(r.qty) || 0);
      }
      if (lookup.size > 0) return { lookup, cutoffDate: asOfDate || cutoff, source: 'restlet' };
    } catch (err) {
      console.error('[asOfAnchor] RESTlet call failed, falling back to CSV snapshot:', (err as Error)?.message);
    }
  }
  const csv = await readSnapshotLookup();
  if (csv.cutoffDate && csv.lookup.size > 0) {
    return { lookup: csv.lookup, cutoffDate: csv.cutoffDate, source: 'csv' };
  }
  return { lookup: new Map(), cutoffDate: null, source: 'none' };
}
