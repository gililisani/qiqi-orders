import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createStorage } from '../../../../../platform/storage';
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
    const productLineFilter = searchParams.get('productLine') || '';
    const localeFilter = searchParams.get('locale') || '';
    const regionFilter = searchParams.get('region') || '';
    const tagFilter = searchParams.get('tag') || '';

    // Build query with optional full-text search
    let assetsQuery = supabaseAdmin
      .from('dam_assets')
      .select(
        `
        id,
        title,
        description,
        asset_type,
        product_line,
        sku,
        vimeo_video_id,
        vimeo_download_1080p,
        vimeo_download_720p,
        vimeo_download_480p,
        vimeo_download_360p,
        created_at,
        search_tags
      `
      )
      .eq('is_archived', false); // Only show non-archived assets

    // Apply filters
    if (searchQuery.trim()) {
      const searchTerm = `%${searchQuery.trim()}%`;
      assetsQuery = assetsQuery.or(
        `title.ilike.${searchTerm},description.ilike.${searchTerm},product_line.ilike.${searchTerm},sku.ilike.${searchTerm}`
      );
    }

    if (typeFilter) {
      assetsQuery = assetsQuery.eq('asset_type', typeFilter);
    }

    if (productLineFilter) {
      assetsQuery = assetsQuery.ilike('product_line', `%${productLineFilter}%`);
    }

    const { data: assetsData, error } = await assetsQuery.order('created_at', { ascending: false });

    if (error) throw error;

    if (!assetsData || assetsData.length === 0) {
      return NextResponse.json({ assets: [] });
    }

    async function fetchLatestVersion(assetId: string) {
      const { data, error: versionError } = await supabaseAdmin
        .from('dam_asset_versions')
        .select(
          'id, asset_id, version_number, storage_path, thumbnail_path, mime_type, file_size, processing_status, created_at, metadata, extracted_text, duration_seconds, width, height'
        )
        .eq('asset_id', assetId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (versionError) {
        throw versionError;
      }
      return data ?? null;
    }

    const versionsByAsset = new Map<string, any>();
    for (const asset of assetsData) {
      const version = await fetchLatestVersion(asset.id);
      if (version) {
        versionsByAsset.set(asset.id, version);
      }
    }

    // Filter by extracted_text if search query provided
    let filteredAssets = assetsData;
    if (searchQuery.trim()) {
      const lowerSearchQuery = searchQuery.trim().toLowerCase();
      const metadataMatchedIds = new Set(assetsData.map((a) => a.id));
      const textMatchedIds = new Set<string>();
      for (const [assetId, version] of versionsByAsset.entries()) {
        if (version?.extracted_text?.toLowerCase().includes(lowerSearchQuery)) {
          textMatchedIds.add(assetId);
        }
      }
      filteredAssets = assetsData.filter((asset) => {
        return metadataMatchedIds.has(asset.id) || textMatchedIds.has(asset.id);
      });
    }

    // Fetch tags, audiences, locales, regions
    const { data: tagsData, error: tagsError } = await supabaseAdmin
      .from('dam_asset_tag_map')
      .select('asset_id, tag:dam_tags(slug, label)');
    if (tagsError) throw tagsError;

    const tagsByAsset = tagsData?.reduce((acc: Record<string, string[]>, row) => {
      const arr = acc[row.asset_id] || (acc[row.asset_id] = []);
      const tagEntry = Array.isArray(row.tag) ? row.tag[0] : row.tag;
      if (tagEntry?.label) arr.push(tagEntry.label);
      return acc;
    }, {}) ?? {};

    const { data: audiencesData, error: audiencesError } = await supabaseAdmin
      .from('dam_asset_audience_map')
      .select('asset_id, audience:dam_audiences(code, label)');
    if (audiencesError) throw audiencesError;

    const audiencesByAsset = audiencesData?.reduce((acc: Record<string, string[]>, row) => {
      const arr = acc[row.asset_id] || (acc[row.asset_id] = []);
      const audienceEntry = Array.isArray(row.audience) ? row.audience[0] : row.audience;
      if (audienceEntry?.label) arr.push(audienceEntry.label);
      return acc;
    }, {}) ?? {};

    const { data: localesData, error: localesError } = await supabaseAdmin
      .from('dam_asset_locale_map')
      .select('asset_id, locale:dam_locales(code,label,is_default)');
    if (localesError) throw localesError;

    const localesByAsset = localesData?.reduce((acc: Record<string, LocaleOption[]>, row) => {
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

    const { data: regionsData, error: regionsError } = await supabaseAdmin
      .from('dam_asset_region_map')
      .select('asset_id, region:dam_regions(code,label)');
    if (regionsError) throw regionsError;

    const regionsByAsset = regionsData?.reduce((acc: Record<string, RegionOption[]>, row) => {
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

    // Apply client-side filters (locale, region, tag)
    filteredAssets = filteredAssets.filter((asset) => {
      // Filter by locale
      if (localeFilter) {
        const assetLocales = localesByAsset[asset.id] || [];
        if (!assetLocales.some((l) => l.code === localeFilter)) {
          return false;
        }
      }

      // Filter by region
      if (regionFilter) {
        const assetRegions = regionsByAsset[asset.id] || [];
        if (!assetRegions.some((r) => r.code === regionFilter)) {
          return false;
        }
      }

      // Filter by tag
      if (tagFilter) {
        const assetTags = tagsByAsset[asset.id] || [];
        if (!assetTags.some((t) => t.toLowerCase().includes(tagFilter.toLowerCase()))) {
          return false;
        }
      }

      return true;
    });

    const assets = filteredAssets.map((record: any) => {
      const currentVersionRaw = versionsByAsset.get(record.id) ?? null;
      const currentVersion = currentVersionRaw
        ? {
            id: currentVersionRaw.id,
            version_number: currentVersionRaw.version_number,
            storage_path: currentVersionRaw.storage_path,
            thumbnail_path: currentVersionRaw.thumbnail_path,
            mime_type: currentVersionRaw.mime_type,
            file_size: currentVersionRaw.file_size,
            processing_status: currentVersionRaw.processing_status || 'complete',
            created_at: currentVersionRaw.created_at,
            duration_seconds: currentVersionRaw.duration_seconds,
            width: currentVersionRaw.width,
            height: currentVersionRaw.height,
            downloadPath: buildDownloadPath(record.id, currentVersionRaw.id, 'original'),
            previewPath: buildDownloadPath(
              record.id,
              currentVersionRaw.id,
              currentVersionRaw.thumbnail_path ? 'thumbnail' : 'original'
            ),
          }
        : null;

      return {
        id: record.id,
        title: record.title,
        description: record.description,
        asset_type: record.asset_type,
        product_line: record.product_line,
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

    return NextResponse.json({ assets });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Client assets fetch failed', err);
    return NextResponse.json({ error: err.message || 'Failed to load assets' }, { status: 500 });
  }
}

