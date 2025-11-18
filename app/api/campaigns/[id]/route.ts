import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAuth } from '../../../../platform/auth';
import { createStorage } from '../../../../platform/storage';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function createSupabaseAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
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

// GET /api/campaigns/[id] - Get campaign details with assets
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();

    // Fetch campaign
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', params.id)
      .single();

    if (campaignError) throw campaignError;
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Fetch asset IDs in this campaign
    const { data: campaignAssets, error: campaignAssetsError } = await supabaseAdmin
      .from('campaign_assets')
      .select('asset_id')
      .eq('campaign_id', params.id);

    if (campaignAssetsError) throw campaignAssetsError;

    const assetIds = (campaignAssets || []).map(ca => ca.asset_id);

    if (assetIds.length === 0) {
      return NextResponse.json({
        campaign,
        assets: [],
        asset_count: 0,
      });
    }

    // Fetch assets
    const { data: assetsData, error: assetsError } = await supabaseAdmin
      .from('dam_assets')
      .select(`
        id,
        title,
        description,
        asset_type,
        asset_type_id,
        asset_subtype_id,
        product_line,
        product_name,
        sku,
        vimeo_video_id,
        vimeo_download_1080p,
        vimeo_download_720p,
        vimeo_download_480p,
        vimeo_download_360p,
        use_title_as_filename,
        created_at,
        search_tags
      `)
      .in('id', assetIds)
      .eq('is_archived', false);

    if (assetsError) throw assetsError;

    // Fetch versions for these assets
    const { data: versionsData, error: versionsError } = await supabaseAdmin
      .from('dam_asset_versions')
      .select('id, asset_id, version_number, storage_path, thumbnail_path, mime_type, file_size, processing_status, created_at, metadata, duration_seconds, width, height')
      .in('asset_id', assetIds)
      .order('version_number', { ascending: false });

    if (versionsError) throw versionsError;

    // Get latest version for each asset
    const versionsByAsset = new Map<string, any>();
    (versionsData || []).forEach(v => {
      if (!versionsByAsset.has(v.asset_id)) {
        versionsByAsset.set(v.asset_id, v);
      }
    });

    // Fetch tags, locales, regions for these assets
    const { data: tagsData } = await supabaseAdmin
      .from('dam_asset_tag_map')
      .select('asset_id, tag:dam_tags(slug, name)')
      .in('asset_id', assetIds);

    const { data: localesData } = await supabaseAdmin
      .from('dam_asset_locale_map')
      .select('asset_id, locale_code, is_primary, locale:dam_locales(code, label, is_default)')
      .in('asset_id', assetIds);

    const { data: regionsData } = await supabaseAdmin
      .from('dam_asset_region_map')
      .select('asset_id, region_code, region:dam_regions(code, label)')
      .in('asset_id', assetIds);

    // Build tag/locale/region maps
    const tagsByAsset: Record<string, string[]> = {};
    (tagsData || []).forEach((row: any) => {
      const tag = Array.isArray(row.tag) ? row.tag[0] : row.tag;
      if (tag?.slug) {
        if (!tagsByAsset[row.asset_id]) tagsByAsset[row.asset_id] = [];
        tagsByAsset[row.asset_id].push(tag.slug);
      }
    });

    const localesByAsset: Record<string, any[]> = {};
    (localesData || []).forEach((row: any) => {
      const locale = Array.isArray(row.locale) ? row.locale[0] : row.locale;
      if (locale?.code) {
        if (!localesByAsset[row.asset_id]) localesByAsset[row.asset_id] = [];
        localesByAsset[row.asset_id].push({
          code: locale.code,
          label: locale.label,
          is_default: row.is_primary || locale.is_default,
        });
      }
    });

    const regionsByAsset: Record<string, any[]> = {};
    (regionsData || []).forEach((row: any) => {
      const region = Array.isArray(row.region) ? row.region[0] : row.region;
      if (region?.code) {
        if (!regionsByAsset[row.asset_id]) regionsByAsset[row.asset_id] = [];
        regionsByAsset[row.asset_id].push({
          code: region.code,
          label: region.label,
        });
      }
    });

    // Try to fetch use_title_as_filename separately
    let useTitleAsFilenameMap: Record<string, boolean> = {};
    try {
      const { data: filenameFlags } = await supabaseAdmin
        .from('dam_assets')
        .select('id, use_title_as_filename')
        .in('id', assetIds);
      if (filenameFlags) {
        filenameFlags.forEach((flag: any) => {
          if (flag.id) {
            useTitleAsFilenameMap[flag.id] = flag.use_title_as_filename ?? false;
          }
        });
      }
    } catch (err) {
      // Column doesn't exist yet - use defaults
    }

    // Build assets array
    const assets = (assetsData || []).map((record: any) => {
      const currentVersionRaw = versionsByAsset.get(record.id) ?? null;
      const metadata = currentVersionRaw?.metadata as Record<string, any> | null;
      const originalFileName = metadata?.originalFileName || null;

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
            previewPath: buildPreviewPath(
              record.id,
              currentVersionRaw.id,
              currentVersionRaw.thumbnail_path ? 'thumbnail' : 'original'
            ),
            originalFileName: originalFileName,
          }
        : null;

      // Extract video formats from description if stored there
      let extractedFormats: any[] | null = null;
      let cleanDescription = record.description;
      if (record.description && typeof record.description === 'string') {
        const formatMatch = record.description.match(/<!--VIDEO_FORMATS:(.+?)-->/);
        if (formatMatch) {
          try {
            extractedFormats = JSON.parse(formatMatch[1]);
            cleanDescription = record.description.replace(/<!--VIDEO_FORMATS:.+?-->/, '').trim();
          } catch (e) {
            // Ignore parse errors
          }
        }
      }

      return {
        id: record.id,
        title: record.title,
        description: cleanDescription,
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
        vimeo_download_formats: extractedFormats ?? null,
        use_title_as_filename: useTitleAsFilenameMap[record.id] ?? false,
        created_at: record.created_at,
        current_version: currentVersion,
        tags: tagsByAsset[record.id] ?? [],
        locales: localesByAsset[record.id] ?? [],
        regions: regionsByAsset[record.id] ?? [],
      };
    });

    // Get thumbnail path for campaign if thumbnail_asset_id is set
    let campaignThumbnailPath: string | null = null;
    if (campaign.thumbnail_asset_id) {
      const thumbnailVersion = versionsByAsset.get(campaign.thumbnail_asset_id);
      if (thumbnailVersion?.thumbnail_path) {
        campaignThumbnailPath = thumbnailVersion.thumbnail_path;
      }
    }

    return NextResponse.json({
      campaign: {
        ...campaign,
        thumbnail_path: campaignThumbnailPath,
      },
      assets,
      asset_count: assets.length,
    });
  } catch (err: any) {
    console.error('Campaign fetch failed', err);
    return NextResponse.json({ error: err.message || 'Failed to load campaign' }, { status: 500 });
  }
}

// DELETE /api/campaigns/[id] - Delete a campaign
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();

    // Delete campaign (campaign_assets will be deleted via CASCADE)
    const { error: deleteError } = await supabaseAdmin
      .from('campaigns')
      .delete()
      .eq('id', params.id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Campaign deletion failed', err);
    return NextResponse.json({ error: err.message || 'Failed to delete campaign' }, { status: 500 });
  }
}

// PATCH /api/campaigns/[id] - Update campaign
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.description !== undefined) updateData.description = body.description?.trim() || null;
    if (body.thumbnailAssetId !== undefined) updateData.thumbnail_asset_id = body.thumbnailAssetId || null;
    if (body.productLine !== undefined) updateData.product_line = body.productLine || null;
    if (body.startDate !== undefined) updateData.start_date = body.startDate || null;
    if (body.endDate !== undefined) updateData.end_date = body.endDate || null;

    const { data: campaign, error: updateError } = await supabaseAdmin
      .from('campaigns')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ campaign });
  } catch (err: any) {
    console.error('Campaign update failed', err);
    return NextResponse.json({ error: err.message || 'Failed to update campaign' }, { status: 500 });
  }
}

