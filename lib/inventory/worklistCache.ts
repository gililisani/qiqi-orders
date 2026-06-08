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
import type { NegativeWindow, Tier } from '@/lib/inventory/negativeWindows';

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

  // Preserve prior statuses for carry-over. Keyed on (item, location, since) —
  // a location can have multiple negative windows, each its own row/status.
  const { data: existing } = await sb
    .from('inv_inv_worklist')
    .select('item_code, location_ns_id, since, status');
  const prevStatus = new Map<string, string>();
  for (const e of existing ?? []) prevStatus.set(`${e.item_code}|${e.location_ns_id}|${e.since ?? ''}`, e.status);

  // Replace all rows.
  await sb.from('inv_inv_worklist').delete().neq('item_code', '');

  const now = new Date().toISOString();
  const rows = comp.rows.map((r) => {
    const prev = prevStatus.get(`${r.itemCode}|${r.locationNsId}|${r.since ?? ''}`);
    const status: WorklistStatus = prev === 'skipped' ? 'skipped' : 'todo'; // 'done' resets to 'todo'
    return {
      item_code: r.itemCode,
      ns_item_id: r.nsItemId,
      item_name: r.itemName,
      location_ns_id: r.locationNsId,
      location_name: r.locationName,
      depth: r.depth,
      since: r.since,
      recommended_action: r.recommendationType,
      recommendation_type: r.recommendationType,
      edits_required: r.editsRequired,
      prerequisite_summary: r.prerequisiteSummary,
      is_broken_chain: r.isBrokenChain,
      options: r.options,
      suspect_ns_transaction_id: r.suspectNsTransactionId,
      suspect_doc: r.suspectDoc,
      suspect_type: r.suspectType,
      suspect_date: r.suspectDate,
      confidence: r.category,
      tier: r.tier,
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
    recommendationType: r.recommendation_type ?? r.recommended_action,
    category: r.confidence,
    editsRequired: r.edits_required ?? [],
    prerequisiteSummary: r.prerequisite_summary ?? 'None',
    isBrokenChain: !!r.is_broken_chain,
    options: r.options ?? [],
    suspectNsTransactionId: r.suspect_ns_transaction_id,
    suspectDoc: r.suspect_doc,
    suspectType: r.suspect_type,
    suspectDate: r.suspect_date,
    tier: (Number(r.tier) || 4) as Tier,
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
  since: string | null,
  status: WorklistStatus,
): Promise<void> {
  const sb = createServiceRoleClient();
  let q = sb
    .from('inv_inv_worklist')
    .update({ status })
    .eq('item_code', itemCode.toUpperCase())
    .eq('location_ns_id', locationNsId);
  q = since ? q.eq('since', since) : q.is('since', null);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function writeNegativeWindows(windows: NegativeWindow[]): Promise<void> {
  const sb = createServiceRoleClient();
  await sb.from('inv_inv_negative_windows').delete().neq('item_code', '');
  const now = new Date().toISOString();
  const rows = windows.map((w) => ({
    item_code: w.itemCode,
    ns_item_id: w.nsItemId,
    item_name: w.itemName,
    location_ns_id: w.locationNsId,
    location_name: w.locationName,
    start_date: w.start,
    end_date: w.end,
    min_balance: w.minBalance,
    duration_days: w.durationDays,
    builds_during: w.buildsDuring,
    other_outbound_during: w.otherOutboundDuring,
    status: w.status,
    crossed_closed_period: w.crossedClosedPeriod,
    tier: w.tier,
    computed_at: now,
  }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from('inv_inv_negative_windows').insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`negative windows insert: ${error.message}`);
  }
}

export async function readNegativeWindows(): Promise<NegativeWindow[]> {
  const sb = createServiceRoleClient();
  const { data } = await sb.from('inv_inv_negative_windows').select('*');
  return (data ?? []).map((r: any) => ({
    itemCode: r.item_code,
    nsItemId: r.ns_item_id,
    itemName: r.item_name,
    locationNsId: r.location_ns_id,
    locationName: r.location_name,
    start: r.start_date,
    end: r.end_date,
    minBalance: Number(r.min_balance),
    durationDays: Number(r.duration_days),
    buildsDuring: Number(r.builds_during),
    otherOutboundDuring: Number(r.other_outbound_during),
    status: r.status,
    crossedClosedPeriod: !!r.crossed_closed_period,
    tier: (Number(r.tier) || 4) as Tier,
  }));
}
