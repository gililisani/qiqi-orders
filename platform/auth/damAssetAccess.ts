import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Record-level authorization for DAM preview/download redirects.
 *
 * Clients (non-admin) must pass every applicable dimension below (AND).
 * Admins bypass all checks.
 *
 * Dimensions (from schema / app usage):
 * - Company: enabled `clients` row with non-null `company_id`.
 * - Locale: languages only (no per-company locale entitlement exists).
 * - Archived: handled in routes (410) before this helper.
 *
 * Not modeled in DB for client entitlement (admin-only or display-only here):
 * - Campaign membership (`campaign_assets`) — client catalog is not campaign-scoped;
 *   campaigns are an admin organizational tool in this codebase.
 */

// Locale codes are treated as languages only (e.g. "en", "ar", "en-US").
// No per-company locale entitlement exists, so locale tags do not restrict delivery.

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

  return assertDamDeliveryAccess(supabase, auth);
}

/**
 * The caller-level half of the check (does this user get DAM delivery at
 * all?), with no per-asset dimension. Batch routes call it once per request
 * and do the per-asset mismatch/archived checks themselves.
 */
export async function assertDamDeliveryAccess(
  supabase: SupabaseClient,
  auth: { userId: string; isAdmin: boolean }
): Promise<NextResponse | null> {
  if (auth.isAdmin) {
    return null;
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

  // Region and audience restrictions removed by product decision.
  // Locale codes are treated as languages only and do not restrict delivery.

  return null;
}
