/**
 * Opening-balance snapshot store + CSV parsing. SERVER-ONLY.
 *
 * Holds the measured per-(item, location) on-hand as of a cutoff date, imported
 * from a NetSuite saved-search CSV. The balance engine anchors on this instead
 * of the unreliable "current QOH − Σtx" implied opening.
 */
import { createServiceRoleClient } from '@/platform/auth/guards';

export interface OpeningSnapshotRow {
  itemCode: string;
  locationName: string;
  qty: number;
}

export interface SnapshotStatus {
  cutoffDate: string | null;
  rowCount: number;
  uploadedAt: string | null;
}

/** Lookup map: `${ITEMCODE}|${locationName}` → qty. Keys upper-cased on item. */
export type OpeningLookup = Map<string, number>;

export function openingKey(itemCode: string, locationName: string): string {
  return `${itemCode.toUpperCase()}|${locationName}`;
}

/**
 * Parse a saved-search CSV. Expected columns (header row, case-insensitive):
 * an item/SKU column, a location column, and a quantity-on-hand column. We
 * detect them by header name so column order is flexible.
 */
export function parseSnapshotCsv(text: string): { rows: OpeningSnapshotRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return { rows: [], errors: ['CSV has no data rows.'] };

  const parseLine = (line: string): string[] => {
    // Minimal CSV: handles quoted fields with commas.
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  const findCol = (...names: string[]) =>
    header.findIndex((h) => names.some((n) => h === n || h.includes(n)));

  const itemIdx = findCol('item', 'sku', 'name');
  const locIdx = findCol('location');
  const qtyIdx = findCol('quantity on hand', 'on hand', 'quantityonhand', 'qty', 'quantity');

  if (itemIdx === -1) errors.push('Could not find an Item/SKU column.');
  if (locIdx === -1) errors.push('Could not find a Location column.');
  if (qtyIdx === -1) errors.push('Could not find a Quantity On Hand column.');
  if (errors.length) return { rows: [], errors };

  const rows: OpeningSnapshotRow[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const itemCode = (cells[itemIdx] ?? '').trim();
    const locationName = (cells[locIdx] ?? '').trim();
    const qtyRaw = (cells[qtyIdx] ?? '').replace(/,/g, '').trim();
    if (!itemCode || !locationName) continue;
    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty)) {
      errors.push(`Row ${i + 1}: non-numeric quantity "${cells[qtyIdx]}" for ${itemCode} @ ${locationName}`);
      continue;
    }
    const key = openingKey(itemCode, locationName);
    if (seen.has(key)) continue; // first wins; a snapshot should be one row per pair
    seen.add(key);
    rows.push({ itemCode, locationName, qty });
  }
  return { rows, errors };
}

export async function writeSnapshot(cutoffDate: string, rows: OpeningSnapshotRow[]): Promise<void> {
  const sb = createServiceRoleClient();
  await sb.from('inv_inv_opening_snapshots').delete().neq('item_code', '');
  const now = new Date().toISOString();
  const payload = rows.map((r) => ({
    cutoff_date: cutoffDate,
    item_code: r.itemCode,
    location_name: r.locationName,
    qty: r.qty,
    uploaded_at: now,
  }));
  const CHUNK = 500;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error } = await sb.from('inv_inv_opening_snapshots').insert(payload.slice(i, i + CHUNK));
    if (error) throw new Error(`snapshot insert: ${error.message}`);
  }
}

export async function readSnapshotLookup(): Promise<{ lookup: OpeningLookup; cutoffDate: string | null }> {
  const sb = createServiceRoleClient();
  const { data } = await sb.from('inv_inv_opening_snapshots').select('item_code, location_name, qty, cutoff_date');
  const lookup: OpeningLookup = new Map();
  let cutoffDate: string | null = null;
  for (const r of data ?? []) {
    lookup.set(openingKey(r.item_code, r.location_name), Number(r.qty));
    cutoffDate = r.cutoff_date;
  }
  return { lookup, cutoffDate };
}

export async function readSnapshotStatus(): Promise<SnapshotStatus> {
  const sb = createServiceRoleClient();
  const { data, count } = await sb
    .from('inv_inv_opening_snapshots')
    .select('cutoff_date, uploaded_at', { count: 'exact' })
    .limit(1);
  const first = data?.[0];
  return {
    cutoffDate: first?.cutoff_date ?? null,
    rowCount: count ?? 0,
    uploadedAt: first?.uploaded_at ?? null,
  };
}
