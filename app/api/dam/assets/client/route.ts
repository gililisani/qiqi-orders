import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAuth } from '../../../../../platform/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function createSupabaseAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Prefer: 'return=minimal',
      },
    },
  });
}

function buildDownloadPath(assetId: string, versionId?: string | null, rendition?: 'thumbnail' | 'original') {
  if (!versionId) return null;
  const base = `/api/assets/${assetId}/download?version=${versionId}`;
  if (rendition === 'thumbnail') {
    return `${base}&rendition=thumbnail`;
  }
  return base;
}

function buildPreviewPath(assetId: string, versionId?: string | null, rendition?: 'thumbnail' | 'original') {
  if (!versionId) return null;
  const base = `/api/assets/${assetId}/preview?version=${versionId}`;
  if (rendition === 'thumbnail') {
    return `${base}&rendition=thumbnail`;
  }
  return base;
}

type LocaleOption = {
  code: string;
  label: string;
  is_default?: boolean;
};

type RegionOption = {
  code: string;
  label: string;
};

export async function GET(request: NextRequest) {
  try {
    // Require client authentication
    const auth = createAuth();
    const clientUser = await auth.requireRole(request, 'client');

    const supabaseAdmin = createSupabaseAdminClient();
    
    // Get search and filter query parameters
    const searchParams = request.nextUrl.searchParams;
    const searchQuery = searchParams.get('q') || '';
    const typeFilter = searchParams.get('type') || '';
    const assetTypeFilter = searchParams.get('assetType') || '';
    const assetSubtypeFilter = searchParams.get('assetSubtype') || '';
    const productLineFilter = searchParams.get('productLine') || '';
    const productNameFilter = searchParams.get('productName') || '';
    const localeFilter = searchParams.get('locale') || '';
    const regionFilter = searchParams.get('region') || '';
    const tagFilter = searchParams.get('tag') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Filter regression fix:
    // The client UI sends `assetType` as a *base type slug* (image/video/document/...)
    // while the entitlement RPC expects either `p_type` (base type) or UUID ids for taxonomy.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const assetTypeIsUuid = UUID_RE.test(assetTypeFilter);
    const assetSubtypeIsUuid = UUID_RE.test(assetSubtypeFilter);

    const effectiveType =
      typeFilter ||
      (!assetTypeIsUuid && assetTypeFilter ? assetTypeFilter : '');

    const effectiveAssetTypeId = assetTypeIsUuid ? assetTypeFilter : null;
    const effectiveAssetSubtypeId = assetSubtypeIsUuid ? assetSubtypeFilter : null;

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      'list_client_dam_assets_entitled',
      {
        p_user_id: clientUser.id,
        p_q: searchQuery,
        p_type: effectiveType,
        p_asset_type_id: effectiveAssetTypeId,
        p_asset_subtype_id: effectiveAssetSubtypeId,
        p_product_line: productLineFilter,
        p_product_name: productNameFilter,
        p_locale_code: localeFilter,
        p_region_code: regionFilter,
        p_tag: tagFilter,
        p_page: page,
        p_limit: limit,
      }
    );
    if (rpcError) throw rpcError;

    const payload = (rpcData ?? { assets: [], total: 0 }) as any;
    const assetsRows = Array.isArray(payload.assets) ? payload.assets : [];
    const total =
      typeof payload.total === 'number'
        ? payload.total
        : typeof payload.total === 'string' && payload.total.trim() !== ''
          ? Number.parseInt(payload.total, 10)
          : 0;

    const pageAssetIds = assetsRows.map((r: any) => r.id).filter(Boolean);

    // Preserve current response shape: hydrate tags/audiences/locales/regions for this page.
    const [{ data: tagsData, error: tagsError }, { data: audiencesData, error: audiencesError }, { data: localesData, error: localesError }, { data: regionsData, error: regionsError }] =
      await Promise.all([
        supabaseAdmin
          .from('dam_asset_tag_map')
          .select('asset_id, tag:dam_tags(slug, label)')
          .in('asset_id', pageAssetIds),
        supabaseAdmin
          .from('dam_asset_audience_map')
          .select('asset_id, audience:dam_audiences(code, label)')
          .in('asset_id', pageAssetIds),
        supabaseAdmin
          .from('dam_asset_locale_map')
          .select('asset_id, locale:dam_locales(code,label,is_default)')
          .in('asset_id', pageAssetIds),
        supabaseAdmin
          .from('dam_asset_region_map')
          .select('asset_id, region:dam_regions(code,label)')
          .in('asset_id', pageAssetIds),
      ]);
    if (tagsError) throw tagsError;
    if (audiencesError) throw audiencesError;
    if (localesError) throw localesError;
    if (regionsError) throw regionsError;

    const tagsByAsset =
      tagsData?.reduce((acc: Record<string, string[]>, row: any) => {
        const arr = acc[row.asset_id] || (acc[row.asset_id] = []);
        const tagEntry = Array.isArray(row.tag) ? row.tag[0] : row.tag;
        if (tagEntry?.label) arr.push(tagEntry.label);
        return acc;
      }, {}) ?? {};

    const audiencesByAsset =
      audiencesData?.reduce((acc: Record<string, string[]>, row: any) => {
        const arr = acc[row.asset_id] || (acc[row.asset_id] = []);
        const audienceEntry = Array.isArray(row.audience) ? row.audience[0] : row.audience;
        if (audienceEntry?.label) arr.push(audienceEntry.label);
        return acc;
      }, {}) ?? {};

    const localesByAsset =
      localesData?.reduce((acc: Record<string, LocaleOption[]>, row: any) => {
        const arr = acc[row.asset_id] || (acc[row.asset_id] = []);
        const localeEntry = Array.isArray(row.locale) ? row.locale[0] : row.locale;
        if (localeEntry?.code) {
          arr.push({
            code: localeEntry.code,
            label: localeEntry.label,
            is_default: localeEntry.is_default,
          });
        }
        return acc;
      }, {}) ?? {};

    const regionsByAsset =
      regionsData?.reduce((acc: Record<string, RegionOption[]>, row: any) => {
        const arr = acc[row.asset_id] || (acc[row.asset_id] = []);
        const regionEntry = Array.isArray(row.region) ? row.region[0] : row.region;
        if (regionEntry?.code) {
          arr.push({
            code: regionEntry.code,
            label: regionEntry.label,
          });
        }
        return acc;
      }, {}) ?? {};

    const assets = assetsRows.map((record: any) => {
      const cv = record.current_version && record.current_version.id ? record.current_version : null;
      const currentVersion = cv
        ? {
            id: cv.id,
            version_number: cv.version_number,
            storage_path: cv.storage_path,
            thumbnail_path: cv.thumbnail_path,
            mime_type: cv.mime_type,
            file_size: cv.file_size,
            processing_status: cv.processing_status || 'complete',
            created_at: cv.created_at,
            duration_seconds: cv.duration_seconds,
            width: cv.width,
            height: cv.height,
            downloadPath: buildDownloadPath(record.id, cv.id, 'original'),
            previewPath: buildPreviewPath(record.id, cv.id, cv.thumbnail_path ? 'thumbnail' : 'original'),
          }
        : null;

      return {
        id: record.id,
        title: record.title,
        description: record.description,
        asset_type: record.asset_type,
        asset_type_id: record.asset_type_id ?? null,
        asset_subtype_id: record.asset_subtype_id ?? null,
        product_line: record.product_line,
        product_name: record.product_name ?? null,
        sku: record.sku,
        vimeo_video_id: record.vimeo_video_id ?? null,
        vimeo_download_1080p: record.vimeo_download_1080p ?? null,
        vimeo_download_720p: record.vimeo_download_720p ?? null,
        vimeo_download_480p: record.vimeo_download_480p ?? null,
        vimeo_download_360p: record.vimeo_download_360p ?? null,
        created_at: record.created_at,
        current_version: currentVersion,
        tags: tagsByAsset[record.id] ?? [],
        audiences: audiencesByAsset[record.id] ?? [],
        locales: localesByAsset[record.id] ?? [],
        regions: regionsByAsset[record.id] ?? [],
      } as any;
    });

    const totalPages = total ? Math.ceil(total / limit) : 1;
    return NextResponse.json({ 
      assets,
      pagination: {
        page,
        limit,
        total: total || 0,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Client assets fetch failed', err);
    return NextResponse.json({ error: err.message || 'Failed to load assets' }, { status: 500 });
  }
}

