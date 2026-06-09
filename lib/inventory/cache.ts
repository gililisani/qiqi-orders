/**
 * Supabase cache for the inventory-investigation tool. SERVER-ONLY
 * (uses the service-role client, which bypasses RLS).
 *
 * Stores only RAW facts (transactions + opening balances); all balances and
 * suspect flags are recomputed by lib/inventory/balanceEngine from these.
 * Plan markers (inv_inv_plan_markers) are intentionally NOT touched by a
 * refresh — they survive re-pulls by keying on ns_transaction_id.
 */
import { createServiceRoleClient } from '@/platform/auth/guards';
import type { PulledItem } from '@/lib/inventory/netsuitePull';
import type { LedgerTxn, OpeningBalance, CorrectionMap, Correction } from '@/lib/inventory/balanceEngine';

export interface PlanMarker {
  id: string;
  itemCode: string;
  nsTransactionId: string;
  plannedAction: string | null;
  proposedValue: string | null;
  note: string | null;
  createdAt: string;
}

export interface CachedItem {
  itemCode: string;
  nsItemId: string | null;
  itemName: string | null;
  itemType: string | null;
  dateMin: string | null;
  dateMax: string | null;
  lastRefreshedAt: string | null;
  transactions: LedgerTxn[];
  openings: OpeningBalance[];
  /** Re-anchor corrections from dated snapshots; pass to computeLedger. */
  corrections: CorrectionMap;
  /** True when dated snapshots anchored this item (enables verified flags). */
  snapshotsApplied: boolean;
  planMarkers: PlanMarker[];
}

const CHUNK = 500;

export async function writeCache(p: PulledItem): Promise<void> {
  const sb = createServiceRoleClient();
  const now = new Date().toISOString();

  const { error: itemErr } = await sb.from('inv_inv_items').upsert(
    {
      item_code: p.itemCode,
      ns_item_id: p.nsItemId,
      item_name: p.itemName,
      item_type: p.itemType,
      date_min: p.dateMin,
      date_max: p.dateMax,
      corrections: Object.fromEntries(p.corrections), // CorrectionMap → jsonb
      snapshots_applied: p.snapshotsApplied,
      last_refreshed_at: now,
      updated_at: now,
    },
    { onConflict: 'item_code' },
  );
  if (itemErr) throw new Error(`cache items: ${itemErr.message}`);

  // Replace transactions + openings (markers untouched).
  await sb.from('inv_inv_transactions').delete().eq('item_code', p.itemCode);
  const txRows = p.transactions.map((t) => ({
    item_code: p.itemCode,
    ns_transaction_id: t.nsTransactionId,
    line_id: t.lineId,
    doc_number: t.docNumber,
    tran_date: t.tranDate,
    tran_type: t.tranType,
    ns_type: t.nsType ?? null,
    location_ns_id: t.locationNsId,
    location_name: t.locationName,
    signed_qty: t.signedQty,
    transfer_group: t.transferGroup ?? null,
    transfer_leg: t.transferLeg ?? null,
    memo: t.memo ?? null,
  }));
  for (let i = 0; i < txRows.length; i += CHUNK) {
    const { error } = await sb.from('inv_inv_transactions').insert(txRows.slice(i, i + CHUNK));
    if (error) throw new Error(`cache transactions: ${error.message}`);
  }

  await sb.from('inv_inv_opening_balances').delete().eq('item_code', p.itemCode);
  const openRows = p.openings.map((o) => ({
    item_code: p.itemCode,
    location_ns_id: o.locationNsId,
    location_name: o.locationName,
    opening_qty: o.openingQty,
    current_qoh: o.currentQoh ?? 0,
  }));
  if (openRows.length) {
    const { error } = await sb.from('inv_inv_opening_balances').insert(openRows);
    if (error) throw new Error(`cache openings: ${error.message}`);
  }
}

export async function readCache(itemCode: string): Promise<CachedItem | null> {
  const sb = createServiceRoleClient();
  const code = itemCode.toUpperCase();

  const { data: item } = await sb
    .from('inv_inv_items')
    .select('*')
    .eq('item_code', code)
    .maybeSingle();
  if (!item) return null;

  const { data: txRows } = await sb
    .from('inv_inv_transactions')
    .select('*')
    .eq('item_code', code);
  const { data: openRows } = await sb
    .from('inv_inv_opening_balances')
    .select('*')
    .eq('item_code', code);
  const { data: markerRows } = await sb
    .from('inv_inv_plan_markers')
    .select('*')
    .eq('item_code', code);

  const transactions: LedgerTxn[] = (txRows ?? []).map((r: any) => ({
    id: r.id,
    nsTransactionId: r.ns_transaction_id,
    lineId: r.line_id,
    docNumber: r.doc_number ?? '',
    tranDate: r.tran_date,
    tranType: r.tran_type,
    nsType: r.ns_type,
    locationNsId: r.location_ns_id,
    locationName: r.location_name ?? r.location_ns_id,
    signedQty: Number(r.signed_qty),
    transferGroup: r.transfer_group,
    transferLeg: r.transfer_leg,
    memo: r.memo ?? undefined,
  }));

  const openings: OpeningBalance[] = (openRows ?? []).map((r: any) => ({
    locationNsId: r.location_ns_id,
    locationName: r.location_name ?? r.location_ns_id,
    openingQty: Number(r.opening_qty),
    currentQoh: Number(r.current_qoh),
  }));

  const planMarkers: PlanMarker[] = (markerRows ?? []).map((r: any) => ({
    id: r.id,
    itemCode: r.item_code,
    nsTransactionId: r.ns_transaction_id,
    plannedAction: r.planned_action,
    proposedValue: r.proposed_value,
    note: r.note,
    createdAt: r.created_at,
  }));

  // Rebuild the CorrectionMap from the stored jsonb object.
  const corrections: CorrectionMap = new Map();
  const rawCorr = (item.corrections ?? {}) as Record<string, Correction[]>;
  for (const [locId, pts] of Object.entries(rawCorr)) {
    if (Array.isArray(pts) && pts.length) corrections.set(locId, pts);
  }

  return {
    itemCode: item.item_code,
    nsItemId: item.ns_item_id,
    itemName: item.item_name,
    itemType: item.item_type,
    dateMin: item.date_min,
    dateMax: item.date_max,
    lastRefreshedAt: item.last_refreshed_at,
    transactions,
    openings,
    corrections,
    snapshotsApplied: !!item.snapshots_applied,
    planMarkers,
  };
}
