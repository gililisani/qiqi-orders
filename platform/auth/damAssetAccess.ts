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
 * - Region: `dam_asset_region_map.region_code` vs company geography (see below).
 *   If the asset has no region rows, this dimension does not apply.
 * - Locale: `dam_asset_locale_map.locale_code` — when codes include a BCP47 region
 *   subtag (e.g. en-US → US), that ISO country must appear in the company’s
 *   eligible geography. Locale rows that do not encode a country (e.g. "en")
 *   do not restrict delivery (no company locale column exists yet).
 * - Audience: `dam_asset_audience_map` vs optional `company_dam_audiences`.
 *   If the company has at least one audience mapping row, the asset’s audiences
 *   must intersect. If the company has no mapping rows, audience tags are not
 *   enforced (legacy / gradual rollout).
 * - Archived: handled in routes (410) before this helper.
 *
 * Company geography for region + locale checks:
 * - `company_territories.country_code`
 * - `companies.ship_to_country` (counts as an eligible market when set)
 *
 * Not modeled in DB for client entitlement (admin-only or display-only here):
 * - Campaign membership (`campaign_assets`) — client catalog is not campaign-scoped;
 *   campaigns are an admin organizational tool in this codebase.
 */

/** BCP47-like locale → ISO 3166-1 alpha-2 from the last segment when length is 2. */
export function localeCodeToCountryIso(localeCode: string): string | null {
  const s = String(localeCode ?? '').trim();
  if (!s) return null;
  const parts = s.split(/[-_]/);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  if (last.length === 2) return last.toUpperCase();
  return null;
}

function isMissingRelationError(err: { message?: string; code?: string }): boolean {
  const msg = (err.message ?? '').toLowerCase();
  return err.code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache');
}

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

  const companyId = clientRow.company_id;

  const [
    { data: regionRows, error: regionErr },
    { data: localeRows, error: localeErr },
    { data: audienceRows, error: audienceErr },
    { data: territoryRows, error: terrErr },
    { data: companyRow, error: companyErr },
  ] = await Promise.all([
    supabase.from('dam_asset_region_map').select('region_code').eq('asset_id', asset.id),
    supabase.from('dam_asset_locale_map').select('locale_code').eq('asset_id', asset.id),
    supabase.from('dam_asset_audience_map').select('audience_id').eq('asset_id', asset.id),
    supabase.from('company_territories').select('country_code').eq('company_id', companyId),
    supabase.from('companies').select('ship_to_country').eq('id', companyId).maybeSingle(),
  ]);

  if (regionErr) {
    console.error('[damAssetAccess] region map', regionErr);
    return NextResponse.json({ error: 'Failed to authorize' }, { status: 500 });
  }
  if (localeErr) {
    console.error('[damAssetAccess] locale map', localeErr);
    return NextResponse.json({ error: 'Failed to authorize' }, { status: 500 });
  }
  if (audienceErr) {
    console.error('[damAssetAccess] audience map', audienceErr);
    return NextResponse.json({ error: 'Failed to authorize' }, { status: 500 });
  }
  if (terrErr) {
    console.error('[damAssetAccess] territories', terrErr);
    return NextResponse.json({ error: 'Failed to authorize' }, { status: 500 });
  }
  if (companyErr) {
    console.error('[damAssetAccess] company', companyErr);
    return NextResponse.json({ error: 'Failed to authorize' }, { status: 500 });
  }

  const assetRegionCodes = new Set(
    (regionRows ?? [])
      .map((r) => String((r as { region_code?: string }).region_code ?? '').trim().toUpperCase())
      .filter(Boolean)
  );

  const companyCodes = new Set(
    (territoryRows ?? [])
      .map((t) => String(t.country_code ?? '').trim().toUpperCase())
      .filter(Boolean)
  );

  const ship = String(companyRow?.ship_to_country ?? '')
    .trim()
    .toUpperCase();
  if (ship.length === 2) {
    companyCodes.add(ship);
  }

  // --- Region (asset regions vs company geography) ---
  if (assetRegionCodes.size > 0) {
    let overlap = false;
    for (const code of assetRegionCodes) {
      if (companyCodes.has(code)) {
        overlap = true;
        break;
      }
    }
    if (!overlap) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
  }

  // --- Locale (BCP47 region subtags vs company geography) ---
  const localeCodes = (localeRows ?? [])
    .map((r) => String((r as { locale_code?: string }).locale_code ?? '').trim())
    .filter(Boolean);

  if (localeCodes.length > 0) {
    const derivedCountries = new Set<string>();
    for (const lc of localeCodes) {
      const c = localeCodeToCountryIso(lc);
      if (c) derivedCountries.add(c);
    }
    if (derivedCountries.size > 0) {
      let localeOk = false;
      for (const c of derivedCountries) {
        if (companyCodes.has(c)) {
          localeOk = true;
          break;
        }
      }
      if (!localeOk) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }
  }

  // --- Audience (optional company_dam_audiences junction) ---
  const assetAudienceIds = (audienceRows ?? [])
    .map((r) => (r as { audience_id?: string }).audience_id)
    .filter((id): id is string => Boolean(id));

  if (assetAudienceIds.length > 0) {
    const { data: companyAudienceRows, error: caErr } = await supabase
      .from('company_dam_audiences')
      .select('audience_id')
      .eq('company_id', companyId);

    if (caErr) {
      if (isMissingRelationError(caErr)) {
        console.warn(
          '[damAssetAccess] company_dam_audiences unavailable; skipping audience enforcement',
          caErr.message
        );
      } else {
        console.error('[damAssetAccess] company_dam_audiences', caErr);
        return NextResponse.json({ error: 'Failed to authorize' }, { status: 500 });
      }
    } else if ((companyAudienceRows?.length ?? 0) > 0) {
      const allowed = new Set(
        (companyAudienceRows ?? []).map((r) => String((r as { audience_id: string }).audience_id))
      );
      const intersects = assetAudienceIds.some((id) => allowed.has(id));
      if (!intersects) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }
  }

  return null;
}
