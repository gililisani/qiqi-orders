/**
 * Trusted-point store. SERVER-ONLY.
 *
 * Sparse per-(item, location, date) balances read from NetSuite's native
 * "Review Negative Inventory" page (via the owner's logged-in browser during
 * working sessions) or typed manually. The engine applies them as corrections:
 * re-anchor + validate at each point. See migration 20260610090000.
 *
 * Tolerates a missing table (migration not applied yet) — returns empty.
 */
import { createServiceRoleClient } from '@/platform/auth/guards';
import type { TrustedPoint } from '@/lib/inventory/todayAnchor';

export interface TrustedPointRecord extends TrustedPoint {
  id: string;
  source: string;
  capturedAt: string | null;
}

function mapRow(r: any): TrustedPointRecord {
  return {
    id: r.id,
    itemCode: r.item_code,
    locationName: r.location_name,
    asOfDate: r.as_of_date,
    qty: Number(r.qty),
    source: r.source,
    capturedAt: r.captured_at ?? null,
  };
}

/** Points for one item (UPPER-cased), oldest first. Empty on missing table. */
export async function readTrustedPoints(itemCode: string): Promise<TrustedPointRecord[]> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from('inv_inv_trusted_points')
    .select('*')
    .eq('item_code', itemCode.toUpperCase())
    .order('as_of_date', { ascending: true });
  if (error) {
    console.warn(`[trustedPoints] read failed (table missing?): ${error.message}`);
    return [];
  }
  return (data ?? []).map(mapRow);
}

/** ALL points grouped by UPPER-cased item code. Empty on missing table. */
export async function readAllTrustedPoints(): Promise<Map<string, TrustedPointRecord[]>> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from('inv_inv_trusted_points')
    .select('*')
    .order('as_of_date', { ascending: true });
  if (error) {
    console.warn(`[trustedPoints] readAll failed (table missing?): ${error.message}`);
    return new Map();
  }
  const byItem = new Map<string, TrustedPointRecord[]>();
  for (const r of data ?? []) {
    const code = String(r.item_code).toUpperCase();
    (byItem.get(code) ?? byItem.set(code, []).get(code)!).push(mapRow(r));
  }
  return byItem;
}

/** Upsert points (unique on item+location+date — newer read replaces older). */
export async function upsertTrustedPoints(
  points: TrustedPoint[],
  source: 'negatives_page' | 'manual' = 'negatives_page',
): Promise<number> {
  if (!points.length) return 0;
  const sb = createServiceRoleClient();
  const now = new Date().toISOString();
  const rows = points.map((p) => ({
    item_code: p.itemCode.toUpperCase(),
    location_name: p.locationName,
    as_of_date: p.asOfDate,
    qty: p.qty,
    source,
    captured_at: now,
  }));
  const { error } = await sb
    .from('inv_inv_trusted_points')
    .upsert(rows, { onConflict: 'item_code,location_name,as_of_date' });
  if (error) throw new Error(`trusted points upsert: ${error.message}`);
  return rows.length;
}

export async function deleteTrustedPoint(id: string): Promise<void> {
  const sb = createServiceRoleClient();
  const { error } = await sb.from('inv_inv_trusted_points').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteTrustedPointsForItem(itemCode: string): Promise<void> {
  const sb = createServiceRoleClient();
  const { error } = await sb.from('inv_inv_trusted_points').delete().eq('item_code', itemCode.toUpperCase());
  if (error) throw new Error(error.message);
}
