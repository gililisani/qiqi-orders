/**
 * Read/write the cached worklist. SERVER-ONLY (service-role client).
 *
 * Status carry-over on recompute:
 *   - 'skipped' persists (the user intentionally set it aside)
 *   - 'done' is RESET to 'todo' if the case is still negative (it reappeared,
 *     so the fix didn't actually resolve it). Cases that resolved simply aren't
 *     regenerated, so they vanish from the list.
 */
import { createServiceRoleClient } from '@/platform/auth/guards';
import type { WorklistRow } from '@/lib/inventory/worklist';
import type { WorklistComputation } from '@/lib/inventory/worklistPull';

export type WorklistStatus = 'todo' | 'done' | 'skipped';

export interface WorklistRecord extends WorklistRow {
  status: WorklistStatus;
}

export interface WorklistMeta {
  computedAt: string | null;
  itemsScanned: number | null;
  cases: number | null;
  cleanCount: number | null;
  durationMs: number | null;
}

const CHUNK = 500;

export async function writeWorklist(comp: WorklistComputation, durationMs: number): Promise<void> {
  const sb = createServiceRoleClient();

  // Preserve prior statuses for carry-over.
  const { data: existing } = await sb
    .from('inv_inv_worklist')
    .select('item_code, location_ns_id, status');
  const prevStatus = new Map<string, string>();
  for (const e of existing ?? []) prevStatus.set(`${e.item_code}|${e.location_ns_id}`, e.status);

  // Replace all rows.
  await sb.from('inv_inv_worklist').delete().neq('item_code', '');

  const now = new Date().toISOString();
  const rows = comp.rows.map((r) => {
    const prev = prevStatus.get(`${r.itemCode}|${r.locationNsId}`);
    const status: WorklistStatus = prev === 'skipped' ? 'skipped' : 'todo'; // 'done' resets to 'todo'
    return {
      item_code: r.itemCode,
      ns_item_id: r.nsItemId,
      item_name: r.itemName,
      location_ns_id: r.locationNsId,
      location_name: r.locationName,
      depth: r.depth,
      since: r.since,
      recommended_action: r.recommendedAction,
      suspect_ns_transaction_id: r.suspectNsTransactionId,
      suspect_doc: r.suspectDoc,
      suspect_type: r.suspectType,
      suspect_date: r.suspectDate,
      change_from: r.changeFrom,
      change_to: r.changeTo,
      confidence: r.category,
      notes: r.notes,
      status,
      computed_at: now,
    };
  });

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from('inv_inv_worklist').insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`worklist insert: ${error.message}`);
  }

  const { error: metaErr } = await sb.from('inv_inv_worklist_meta').upsert(
    {
      id: 1,
      computed_at: now,
      items_scanned: comp.stats.itemsScanned,
      cases: comp.stats.cases,
      clean_count: comp.stats.cleanCount,
      duration_ms: durationMs,
    },
    { onConflict: 'id' },
  );
  if (metaErr) throw new Error(`worklist meta: ${metaErr.message}`);
}

export async function readWorklist(): Promise<{ rows: WorklistRecord[]; meta: WorklistMeta }> {
  const sb = createServiceRoleClient();
  const { data: rowData } = await sb
    .from('inv_inv_worklist')
    .select('*')
    .order('depth', { ascending: true });
  const { data: metaData } = await sb
    .from('inv_inv_worklist_meta')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  const rows: WorklistRecord[] = (rowData ?? []).map((r: any) => ({
    itemCode: r.item_code,
    nsItemId: r.ns_item_id,
    itemName: r.item_name,
    locationNsId: r.location_ns_id,
    locationName: r.location_name,
    depth: Number(r.depth),
    since: r.since,
    recommendedAction: r.recommended_action,
    suspectNsTransactionId: r.suspect_ns_transaction_id,
    suspectDoc: r.suspect_doc,
    suspectType: r.suspect_type,
    suspectDate: r.suspect_date,
    changeFrom: r.change_from,
    changeTo: r.change_to,
    category: r.confidence,
    notes: r.notes,
    status: r.status,
  }));

  const meta: WorklistMeta = metaData
    ? {
        computedAt: metaData.computed_at,
        itemsScanned: metaData.items_scanned,
        cases: metaData.cases,
        cleanCount: metaData.clean_count,
        durationMs: metaData.duration_ms,
      }
    : { computedAt: null, itemsScanned: null, cases: null, cleanCount: null, durationMs: null };

  return { rows, meta };
}

export async function setWorklistStatus(
  itemCode: string,
  locationNsId: string,
  status: WorklistStatus,
): Promise<void> {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from('inv_inv_worklist')
    .update({ status })
    .eq('item_code', itemCode.toUpperCase())
    .eq('location_ns_id', locationNsId);
  if (error) throw new Error(error.message);
}
