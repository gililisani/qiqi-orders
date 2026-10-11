/**
 * Inventory Check — what the page shows: the ships-from locations, one
 * check (latest by default) with its lines, the previous good check's
 * differences (so a changed difference stands out), and recent history.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { lineDifference, lineStatus, type CheckLine } from './compare';

const HISTORY = 30;

export interface CheckHeader {
  id: string;
  checkedAt: string;
  trigger: 'manual' | 'nightly';
  checkedBy: string | null;
  warehouses: string[];
  error: string | null;
}

export interface InventoryCheckView {
  locations: Array<{ id: string; name: string }>;
  locationId: string | null;
  check: CheckHeader | null;
  lines: CheckLine[];
  /** Difference per SKU at the previous successful check (null = none). */
  previous: { checkedAt: string; differences: Record<string, number> } | null;
  history: Array<{ id: string; checkedAt: string; trigger: string; error: string | null; different: number | null }>;
}

const LINE_COLUMNS =
  'check_id, sku, name, in_catalog, ns_on_hand, ns_available, ns_committed, wms_on_hand, wms_available, wms_allocated, wms_non_sellable, wms_kit';

const toNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toLine(r: any): CheckLine {
  return {
    sku: r.sku,
    name: r.name,
    in_catalog: !!r.in_catalog,
    ns_on_hand: toNum(r.ns_on_hand),
    ns_available: toNum(r.ns_available),
    ns_committed: toNum(r.ns_committed),
    wms_on_hand: toNum(r.wms_on_hand),
    wms_available: toNum(r.wms_available),
    wms_allocated: toNum(r.wms_allocated),
    wms_non_sellable: toNum(r.wms_non_sellable),
    wms_kit: !!r.wms_kit,
  };
}

async function linesFor(supabase: SupabaseClient, checkIds: string[]): Promise<Array<CheckLine & { check_id: string }>> {
  const out: Array<CheckLine & { check_id: string }> = [];
  if (!checkIds.length) return out;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('inventory_check_lines')
      .select(LINE_COLUMNS)
      .in('check_id', checkIds)
      .order('check_id')
      .order('sku')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) out.push({ ...toLine(r), check_id: (r as any).check_id });
    if (!data || data.length < 1000) return out;
  }
}

export async function loadInventoryCheckView(
  supabase: SupabaseClient,
  opts: { locationId?: string | null; checkId?: string | null },
): Promise<InventoryCheckView> {
  const { data: routes, error: routesErr } = await supabase
    .from('fulfillment_routes')
    .select('location:Locations(id, location_name)');
  if (routesErr) throw new Error(routesErr.message);
  const locMap = new Map<string, string>();
  for (const r of (routes ?? []) as any[]) if (r.location) locMap.set(r.location.id, r.location.location_name);
  const locations = [...locMap].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

  const locationId = opts.locationId && locMap.has(opts.locationId) ? opts.locationId : locations[0]?.id ?? null;
  const empty: InventoryCheckView = { locations, locationId, check: null, lines: [], previous: null, history: [] };
  if (!locationId) return empty;

  const { data: checks, error: checksErr } = await supabase
    .from('inventory_checks')
    .select('id, checked_at, trigger, checked_by, warehouses, error')
    .eq('location_id', locationId)
    .order('checked_at', { ascending: false })
    .limit(HISTORY);
  if (checksErr) throw new Error(checksErr.message);
  const list = (checks ?? []) as any[];
  if (!list.length) return empty;

  const current = (opts.checkId && list.find((c) => c.id === opts.checkId)) || list[0];
  const currentIdx = list.indexOf(current);
  const previous = list.slice(currentIdx + 1).find((c) => !c.error) ?? null;

  const all = await linesFor(supabase, list.map((c) => c.id));
  const byCheck = new Map<string, CheckLine[]>();
  for (const l of all) {
    const { check_id, ...line } = l;
    byCheck.set(check_id, [...(byCheck.get(check_id) ?? []), line]);
  }

  let checkedBy: string | null = null;
  if (current.checked_by) {
    const { data: admin } = await supabase.from('admins').select('name, email').eq('id', current.checked_by).maybeSingle();
    checkedBy = admin?.name || admin?.email || null;
  }

  const lines = (byCheck.get(current.id) ?? []).sort(
    (a, b) => Number(b.in_catalog) - Number(a.in_catalog) || a.sku.localeCompare(b.sku),
  );
  return {
    locations,
    locationId,
    check: {
      id: current.id,
      checkedAt: current.checked_at,
      trigger: current.trigger,
      checkedBy,
      warehouses: current.warehouses ?? [],
      error: current.error,
    },
    lines,
    previous: previous
      ? {
          checkedAt: previous.checked_at,
          differences: Object.fromEntries((byCheck.get(previous.id) ?? []).map((l) => [l.sku, lineDifference(l)])),
        }
      : null,
    history: list.map((c) => ({
      id: c.id,
      checkedAt: c.checked_at,
      trigger: c.trigger,
      error: c.error,
      different: c.error ? null : (byCheck.get(c.id) ?? []).filter((l) => lineStatus(l) !== 'match').length,
    })),
  };
}
