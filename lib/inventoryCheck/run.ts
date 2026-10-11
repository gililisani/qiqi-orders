/**
 * Inventory Check — take one snapshot per ships-from location (Settings →
 * Fulfillment routes) and store it. Read-only towards NetSuite and ShipHero.
 *
 * The warehouse side is the whole ShipHero customer account (today one
 * warehouse, BrandFox "Primary"). A second ships-from location on another
 * warehouse will need a location → warehouse setting first.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCheckLines, skuKey, summarize, type CheckSummary, type NsStock, type WmsStock } from './compare';

export interface InventoryCheckDeps {
  fetchNetSuite: (locationNsId: string) => Promise<NsStock[]>;
  fetchWarehouse: () => Promise<{ rows: WmsStock[]; warehouses: string[] }>;
}

export interface InventoryCheckResult {
  locationId: string;
  locationName: string;
  checkId: string | null;
  summary?: CheckSummary;
  error?: string;
}

/** Checks older than this are deleted after each run. */
const KEEP_DAYS = 400;

export async function runInventoryCheck(
  supabase: SupabaseClient,
  deps: InventoryCheckDeps,
  opts: { trigger: 'manual' | 'nightly'; checkedBy?: string | null; now?: Date },
): Promise<InventoryCheckResult[]> {
  const now = opts.now ?? new Date();
  const [routesRes, productsRes] = await Promise.all([
    supabase.from('fulfillment_routes').select('location_id, location:Locations(id, location_name, netsuite_id, active)'),
    supabase.from('Products').select('sku, item_name').range(0, 9999),
  ]);
  if (routesRes.error) throw new Error(routesRes.error.message);
  if (productsRes.error) throw new Error(productsRes.error.message);

  const locations = new Map<string, { id: string; name: string; nsId: string | null }>();
  for (const r of (routesRes.data ?? []) as any[]) {
    const l = r.location;
    if (l && l.active !== false) locations.set(l.id, { id: l.id, name: l.location_name, nsId: l.netsuite_id ? String(l.netsuite_id).trim() : null });
  }
  if (!locations.size) throw new Error('No ships-from location is set (Settings → Fulfillment).');

  const catalog = new Map<string, string | null>();
  for (const p of (productsRes.data ?? []) as any[]) if (p.sku) catalog.set(skuKey(String(p.sku)), p.item_name ?? null);

  // One warehouse read serves every location.
  let warehouse: { rows: WmsStock[]; warehouses: string[] } | null = null;
  let warehouseError: string | null = null;
  try {
    warehouse = await deps.fetchWarehouse();
  } catch (err: any) {
    warehouseError = `ShipHero: ${err?.message ?? String(err)}`;
  }

  const results: InventoryCheckResult[] = [];
  for (const loc of locations.values()) {
    let error = warehouseError;
    let lines: ReturnType<typeof buildCheckLines> = [];
    if (!error) {
      try {
        if (!loc.nsId) throw new Error(`${loc.name} has no NetSuite id (Locations).`);
        lines = buildCheckLines(await deps.fetchNetSuite(loc.nsId), warehouse!.rows, catalog);
      } catch (err: any) {
        error = `NetSuite: ${err?.message ?? String(err)}`;
      }
    }

    const { data: check, error: insErr } = await supabase
      .from('inventory_checks')
      .insert({
        location_id: loc.id,
        checked_at: now.toISOString(),
        trigger: opts.trigger,
        checked_by: opts.checkedBy ?? null,
        warehouses: warehouse?.warehouses ?? [],
        error: error ? error.slice(0, 500) : null,
      })
      .select('id')
      .single();
    if (insErr || !check) throw new Error(insErr?.message ?? 'Could not save the inventory check.');

    if (lines.length) {
      const { error: linesErr } = await supabase
        .from('inventory_check_lines')
        .insert(lines.map((l) => ({ check_id: check.id, ...l })));
      if (linesErr) {
        // Never leave a check that looks complete but has no lines.
        await supabase.from('inventory_checks').delete().eq('id', check.id);
        throw new Error(linesErr.message);
      }
    }
    results.push({
      locationId: loc.id,
      locationName: loc.name,
      checkId: check.id,
      ...(error ? { error } : { summary: summarize(lines) }),
    });
  }

  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString();
  await supabase.from('inventory_checks').delete().lt('checked_at', cutoff);
  return results;
}
