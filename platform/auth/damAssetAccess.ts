import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Record-level authorization for DAM preview/download redirects.
 *
 * Entitlement (clients):
 * - User must be an enabled client with a non-null company_id.
 * - The requested version must belong to the asset id in the URL (caller validates; we re-check).
 * - If dam_asset_region_map has no rows for the asset, the asset is treated as not
 *   region-restricted (any client may access, subject to other checks).
 * - If the asset has at least one region_code, the client's company must have a
 *   company_territories.country_code that matches one of those region codes (case-insensitive).
 *
 * Admins: always allowed (no company/region checks).
 *
 * Not enforced here (no company ↔ audience mapping in this codebase):
 * - dam_asset_audience_map / dam_audiences — catalog still exposes audience labels only.
 */

export async function assertDamAssetDeliveryEntitlement(
  supabase: SupabaseClient,
  auth: { userId: string; isAdmin: boolean },
  asset: { id: string; is_archived: boolean },
  routeAssetId: string,
  version: { id: string; asset_id: string }
): Promise<NextResponse | null> {
  if (auth.isAdmin) {
    return null;
  }

  if (version.asset_id !== routeAssetId || asset.id !== routeAssetId) {
    return NextResponse.json({ error: 'Asset mismatch' }, { status: 404 });
  }

  const { data: clientRow, error: clientErr } = await supabase
    .from('clients')
    .select('company_id')
    .eq('id', auth.userId)
    .eq('enabled', true)
    .maybeSingle();

  if (clientErr) {
    console.error('[damAssetAccess] client fetch', clientErr);
    return NextResponse.json({ error: 'Failed to authorize' }, { status: 500 });
  }

  if (!clientRow?.company_id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { data: regionRows, error: regionErr } = await supabase
    .from('dam_asset_region_map')
    .select('region_code')
    .eq('asset_id', asset.id);

  if (regionErr) {
    console.error('[damAssetAccess] region map', regionErr);
    return NextResponse.json({ error: 'Failed to authorize' }, { status: 500 });
  }

  const assetRegionCodes = new Set(
    (regionRows ?? [])
      .map((r) => String(r.region_code ?? '').trim().toUpperCase())
      .filter(Boolean)
  );

  if (assetRegionCodes.size === 0) {
    return null;
  }

  const { data: territoryRows, error: terrErr } = await supabase
    .from('company_territories')
    .select('country_code')
    .eq('company_id', clientRow.company_id);

  if (terrErr) {
    console.error('[damAssetAccess] territories', terrErr);
    return NextResponse.json({ error: 'Failed to authorize' }, { status: 500 });
  }

  const companyCodes = new Set(
    (territoryRows ?? [])
      .map((t) => String(t.country_code ?? '').trim().toUpperCase())
      .filter(Boolean)
  );

  for (const code of assetRegionCodes) {
    if (companyCodes.has(code)) {
      return null;
    }
  }

  return NextResponse.json({ error: 'Access denied' }, { status: 403 });
}
