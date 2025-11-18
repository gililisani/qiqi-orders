import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createStorage } from '../../../../platform/storage';
import { randomUUID } from 'crypto';
import { createAuth } from '../../../../platform/auth';
// Queue removed - all processing now happens client-side

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
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const searchQuery = searchParams.get('q') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const fileSizeMin = searchParams.get('fileSizeMin') ? parseInt(searchParams.get('fileSizeMin')!) : null;
    const fileSizeMax = searchParams.get('fileSizeMax') ? parseInt(searchParams.get('fileSizeMax')!) : null;

    // Build query with optional full-text search
    // Note: vimeo_download_formats is selected separately to avoid errors if column doesn't exist yet
    // Select columns - handle use_title_as_filename gracefully if column doesn't exist yet
    let assetsQuery = supabaseAdmin
      .from('dam_assets')
      .select(
        `
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
        created_at,
        search_tags
      `,
        { count: 'exact' }
      );

    // If search query provided, search in multiple fields and extracted text
    if (searchQuery.trim()) {
      const searchTerm = `%${searchQuery.trim()}%`;
      
      // Search in asset metadata (title, description, product_line, sku, search_tags)
      // We'll filter in memory after fetching versions to also search extracted_text
      assetsQuery = assetsQuery.or(
        `title.ilike.${searchTerm},description.ilike.${searchTerm},product_line.ilike.${searchTerm},sku.ilike.${searchTerm}`
      );
    }

    // Apply date range filters
    if (dateFrom) {
      assetsQuery = assetsQuery.gte('created_at', dateFrom);
    }
    if (dateTo) {
      // Add one day to include the entire end date
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      assetsQuery = assetsQuery.lt('created_at', endDate.toISOString());
    }

    const { data: assetsData, error, count } = await assetsQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

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

    // If search query provided, filter assets by extracted_text in memory
    // Note: assets are already filtered by metadata (title, description, etc.) in SQL query above
    // We add an additional filter here to include assets where extracted_text matches
    let filteredAssets = assetsData;
    if (searchQuery.trim()) {
      const lowerSearchQuery = searchQuery.trim().toLowerCase();
      // Get asset IDs that matched metadata search
      const metadataMatchedIds = new Set(assetsData.map((a) => a.id));
      
      // Also check extracted_text from all versions for matches
      // We already fetched all versions above, now check extracted_text
      const textMatchedIds = new Set<string>();
      for (const [assetId, version] of versionsByAsset.entries()) {
        if (version?.extracted_text?.toLowerCase().includes(lowerSearchQuery)) {
          textMatchedIds.add(assetId);
        }
      }
      
      // Combine metadata matches and text matches
      filteredAssets = assetsData.filter((asset) => {
        return metadataMatchedIds.has(asset.id) || textMatchedIds.has(asset.id);
      });
    }

    // Apply file size filters (filter in memory after fetching versions)
    if (fileSizeMin !== null || fileSizeMax !== null) {
      filteredAssets = filteredAssets.filter((asset) => {
        const version = versionsByAsset.get(asset.id);
        if (!version || version.file_size === null) return false;
        const fileSize = version.file_size;
        if (fileSizeMin !== null && fileSize < fileSizeMin) return false;
        if (fileSizeMax !== null && fileSize > fileSizeMax) return false;
        return true;
      });
    }

    const { data: tagsData, error: tagsError } = await supabaseAdmin
      .from('dam_asset_tag_map')
      .select('asset_id, tag:dam_tags(label)');
    if (tagsError) throw tagsError;

    const tagsByAsset = tagsData?.reduce((acc: Record<string, string[]>, row) => {
      const arr = acc[row.asset_id] || (acc[row.asset_id] = []);
      const tagEntry = Array.isArray(row.tag) ? row.tag[0] : row.tag;
      if (tagEntry?.label) arr.push(tagEntry.label);
      return acc;
    }, {}) ?? {};

    // Audience removed - no longer used
    const audiencesByAsset: Record<string, string[]> = {};

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
        arr.push({ code: regionEntry.code, label: regionEntry.label });
      }
      return acc;
    }, {}) ?? {};

    // vimeo_download_formats column will be null until migration is run
    // Frontend will fall back to legacy fields (1080p, 720p, etc.)
    const downloadFormatsByAsset: Record<string, any> = {};

    // Try to fetch use_title_as_filename separately to handle missing column gracefully
    let useTitleAsFilenameMap: Record<string, boolean> = {};
    try {
      const { data: filenameFlags } = await supabaseAdmin
        .from('dam_assets')
        .select('id, use_title_as_filename')
        .in('id', (assetsData ?? []).map((r: any) => r.id));
      if (filenameFlags) {
        filenameFlags.forEach((flag: any) => {
          if (flag.id) {
            useTitleAsFilenameMap[flag.id] = flag.use_title_as_filename ?? false;
          }
        });
      }
    } catch (err) {
      // Column doesn't exist yet - use defaults
      console.log('use_title_as_filename column not found, using defaults');
    }

    const assets = (assetsData ?? []).map((record: any) => {
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
            previewPath: buildPreviewPath(
              record.id,
              currentVersionRaw.id,
              currentVersionRaw.thumbnail_path ? 'thumbnail' : 'original'
            ),
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
        vimeo_download_formats: extractedFormats ?? downloadFormatsByAsset[record.id] ?? null,
        use_title_as_filename: useTitleAsFilenameMap[record.id] ?? false,
        created_at: record.created_at,
        current_version: currentVersion,
        tags: tagsByAsset[record.id] ?? [],
        locales: localesByAsset[record.id] ?? [],
        regions: regionsByAsset[record.id] ?? [],
      } as any;
    });

    const totalPages = count ? Math.ceil(count / limit) : 1;
    return NextResponse.json({ 
      assets,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Assets fetch failed', err);
    return NextResponse.json({ error: err.message || 'Failed to load assets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = createAuth();
    const adminUser = await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const storage = createStorage();

    // Check if request is JSON (for video assets) or FormData (for file uploads)
    const contentType = request.headers.get('content-type') || '';
    let payload: any;
    let file: File | null = null;

    if (contentType.includes('application/json')) {
      // JSON request (video assets without file uploads)
      payload = await request.json();
    } else {
      // FormData request (file uploads)
      const formData = await request.formData();
      const payloadRaw = formData.get('payload');
      file = formData.get('file') as File | null;

      if (!payloadRaw || typeof payloadRaw !== 'string') {
        return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
      }

      payload = JSON.parse(payloadRaw);
    }

    if (!payload.title || !payload.assetType) {
      return NextResponse.json({ error: 'Missing required metadata' }, { status: 400 });
    }

    // Block direct video file uploads - videos must use Vimeo
    if (payload.assetType === 'video' && file) {
      return NextResponse.json(
        { error: 'Videos must be uploaded to Vimeo. Please paste the Vimeo video ID or URL instead of uploading a file.' },
        { status: 400 }
      );
    }

    // Require file for non-video assets (unless editing existing asset)
    if (payload.assetType !== 'video' && !file && !payload.assetId) {
      return NextResponse.json({ error: 'File is required for non-video assets' }, { status: 400 });
    }

    const assetId: string = payload.assetId || randomUUID();

    const tagsInput: string[] = Array.isArray(payload.tags) ? payload.tags : [];
    const localesInput: Array<{ code: string; primary?: boolean }> = Array.isArray(payload.locales)
      ? payload.locales
      : [];
    const regionsInput: string[] = Array.isArray(payload.regions) ? payload.regions : [];

    // Parse Vimeo video ID from URL or use provided ID
    let vimeoVideoId: string | null = null;
    if (payload.assetType === 'video') {
      const vimeoInput = payload.vimeoVideoId || payload.vimeoUrl || '';
      if (vimeoInput) {
        // Extract video ID from Vimeo URL patterns:
        // https://vimeo.com/123456789
        // https://player.vimeo.com/video/123456789
        // https://vimeo.com/123456789?param=value
        // Or just a numeric ID
        if (/^\d+$/.test(vimeoInput.trim())) {
          vimeoVideoId = vimeoInput.trim();
        } else {
          const match = vimeoInput.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
          vimeoVideoId = match ? match[1] : null;
        }
      }
      if (!vimeoVideoId) {
        return NextResponse.json({ error: 'Vimeo video ID or URL is required for video assets' }, { status: 400 });
      }
    }

    let storagePath: string | null = null;
    if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      storagePath = `${assetId}/${Date.now()}-${file.name}`;
      await storage.putObject(storagePath, bytes, {
        contentType: file.type || 'application/octet-stream',
        originalFileName: file.name,
      });
    }

    // Sync asset_type enum with asset_type_id if provided
    let syncedAssetType = payload.assetType;
    if (payload.assetTypeId) {
      // Get the slug from asset_type_id to sync with enum
      const { data: assetTypeData } = await supabaseAdmin
        .from('dam_asset_types')
        .select('slug')
        .eq('id', payload.assetTypeId)
        .single();
      if (assetTypeData) {
        // Map taxonomy slugs to enum values
        const slugToEnumMap: Record<string, string> = {
          'image': 'image',
          'video': 'video',
          'document': 'document',
          'artwork': 'document', // Map artwork to document enum
          'audio': 'audio',
          'packaging-regulatory': 'document', // Map to document enum
          'campaign': 'document', // Map to document enum
        };
        syncedAssetType = slugToEnumMap[assetTypeData.slug] || payload.assetType || 'other';
      }
    }

    if (!payload.assetId) {
      // Prepare description with video formats embedded
      const descriptionWithFormats = payload.vimeoDownloadFormats && payload.vimeoDownloadFormats.length > 0
        ? (payload.description 
            ? `${payload.description}\n\n<!--VIDEO_FORMATS:${JSON.stringify(payload.vimeoDownloadFormats)}-->`
            : `<!--VIDEO_FORMATS:${JSON.stringify(payload.vimeoDownloadFormats)}-->`)
        : (payload.description ?? null);

      const { error: insertAssetError } = await supabaseAdmin.from('dam_assets').insert({
        id: assetId,
        title: payload.title,
        description: descriptionWithFormats,
        asset_type: syncedAssetType,
        asset_type_id: payload.assetTypeId ?? null,
        asset_subtype_id: payload.assetSubtypeId ?? null,
        product_line: payload.productLine ?? null,
        product_name: payload.productName ?? null,
        sku: payload.sku ?? null,
        vimeo_video_id: vimeoVideoId,
        // Save all formats - convert matching ones to legacy fields AND store all in description as JSON backup
        vimeo_download_1080p: payload.vimeoDownload1080p ?? (payload.vimeoDownloadFormats?.find((f: any) => f.resolution === '1080p')?.url) ?? null,
        vimeo_download_720p: payload.vimeoDownload720p ?? (payload.vimeoDownloadFormats?.find((f: any) => f.resolution === '720p')?.url) ?? null,
        vimeo_download_480p: payload.vimeoDownload480p ?? (payload.vimeoDownloadFormats?.find((f: any) => f.resolution === '480p')?.url) ?? null,
        vimeo_download_360p: payload.vimeoDownload360p ?? (payload.vimeoDownloadFormats?.find((f: any) => f.resolution === '360p')?.url) ?? null,
        search_tags: tagsInput,
        use_title_as_filename: payload.useTitleAsFilename ?? false,
        created_by: adminUser.id,
        updated_by: adminUser.id,
      });

      if (insertAssetError) throw insertAssetError;
    } else {
      const updateData: any = {
        title: payload.title,
        description: payload.vimeoDownloadFormats && payload.vimeoDownloadFormats.length > 0
          ? (payload.description 
              ? `${payload.description}\n\n<!--VIDEO_FORMATS:${JSON.stringify(payload.vimeoDownloadFormats)}-->`
              : `<!--VIDEO_FORMATS:${JSON.stringify(payload.vimeoDownloadFormats)}-->`)
          : (payload.description ?? null),
        asset_type: syncedAssetType,
        asset_type_id: payload.assetTypeId ?? null,
        asset_subtype_id: payload.assetSubtypeId ?? null,
        product_line: payload.productLine ?? null,
        product_name: payload.productName ?? null,
        sku: payload.sku ?? null,
        vimeo_video_id: vimeoVideoId,
        // Save all formats - convert matching ones to legacy fields AND store all in description as JSON backup
        vimeo_download_1080p: payload.vimeoDownload1080p ?? (payload.vimeoDownloadFormats?.find((f: any) => f.resolution === '1080p')?.url) ?? null,
        vimeo_download_720p: payload.vimeoDownload720p ?? (payload.vimeoDownloadFormats?.find((f: any) => f.resolution === '720p')?.url) ?? null,
        vimeo_download_480p: payload.vimeoDownload480p ?? (payload.vimeoDownloadFormats?.find((f: any) => f.resolution === '480p')?.url) ?? null,
        vimeo_download_360p: payload.vimeoDownload360p ?? (payload.vimeoDownloadFormats?.find((f: any) => f.resolution === '360p')?.url) ?? null,
        search_tags: tagsInput,
        updated_by: adminUser.id,
        updated_at: new Date().toISOString(),
      };
      
      // Only include use_title_as_filename if provided (column may not exist yet)
      if (payload.useTitleAsFilename !== undefined) {
        updateData.use_title_as_filename = payload.useTitleAsFilename;
      }
      
      const { error: updateAssetError } = await supabaseAdmin
        .from('dam_assets')
        .update(updateData)
        .eq('id', assetId);

      if (updateAssetError) throw updateAssetError;
    }

    // Update associations
    await supabaseAdmin.from('dam_asset_tag_map').delete().eq('asset_id', assetId);
    if (tagsInput.length > 0) {
      const { data: tagsRows, error: tagsError } = await supabaseAdmin
        .from('dam_tags')
        .select('id, slug')
        .in('slug', tagsInput);
      if (tagsError) throw tagsError;
      const tagMaps = (tagsRows ?? []).map((row) => ({ asset_id: assetId, tag_id: row.id }));
      if (tagMaps.length > 0) {
        const { error: tagMapError } = await supabaseAdmin.from('dam_asset_tag_map').insert(tagMaps);
        if (tagMapError) throw tagMapError;
      }
    }

    // Audience removed - no longer used

    await supabaseAdmin.from('dam_asset_locale_map').delete().eq('asset_id', assetId);
    if (localesInput.length > 0) {
      const localeMaps = localesInput.map((locale) => ({
        asset_id: assetId,
        locale_code: locale.code,
        is_primary: Boolean(locale.primary),
      }));
      const { error: localeError } = await supabaseAdmin.from('dam_asset_locale_map').insert(localeMaps);
      if (localeError) throw localeError;
    }

    await supabaseAdmin.from('dam_asset_region_map').delete().eq('asset_id', assetId);
    if (regionsInput.length > 0) {
      const regionMaps = regionsInput.map((code) => ({
        asset_id: assetId,
        region_code: code,
      }));
      const { error: regionError } = await supabaseAdmin.from('dam_asset_region_map').insert(regionMaps);
      if (regionError) throw regionError;
    }

    // Only create version record if we have a file (videos don't have storage files)
    let versionId: string | null = null;
    if (storagePath && file) {
      const { data: lastVersion, error: lastVersionError } = await supabaseAdmin
        .from('dam_asset_versions')
        .select('version_number')
        .eq('asset_id', assetId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastVersionError) throw lastVersionError;
      const nextVersionNumber = lastVersion ? Number(lastVersion.version_number) + 1 : 1;
      versionId = randomUUID();

      const { error: insertVersionError } = await supabaseAdmin
        .from('dam_asset_versions')
        .insert([
          {
            id: versionId,
            asset_id: assetId,
            version_number: nextVersionNumber,
            storage_bucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'dam-assets',
            storage_path: storagePath,
            file_size: file.size,
            checksum: null,
            mime_type: file.type || 'application/octet-stream',
            metadata: {
              originalFileName: file.name,
            },
            processing_status: 'complete', // Set to complete immediately - no background processing
            created_by: adminUser.id,
          },
        ]);

      if (insertVersionError) throw insertVersionError;
    }

    // Handle thumbnail if provided (from client-side PDF thumbnail generation)
    if (payload.thumbnailPath && payload.thumbnailData && versionId) {
      // Generate proper thumbnail path with asset ID
      const finalThumbnailPath = `${assetId}/${Date.now()}-thumb.png`;
      const thumbnailBytes = Uint8Array.from(atob(payload.thumbnailData), (c) => c.charCodeAt(0));
      await storage.putObject(finalThumbnailPath, thumbnailBytes, {
        contentType: 'image/png',
        originalFileName: 'thumb.png',
      });

      // Update version with thumbnail path
      await supabaseAdmin
        .from('dam_asset_versions')
        .update({ thumbnail_path: finalThumbnailPath })
        .eq('id', versionId);

      // Create rendition record
      const { error: renditionError } = await supabaseAdmin
        .from('dam_asset_renditions')
        .insert({
          asset_id: assetId,
          version_id: versionId,
          kind: 'thumb',
          storage_bucket: 'dam-assets',
          storage_path: finalThumbnailPath,
          mime_type: 'image/png',
          file_size: thumbnailBytes.length,
          metadata: {},
          created_by: adminUser.id,
        });

      if (renditionError) {
        console.error('Failed to create thumbnail rendition:', renditionError);
        // Don't fail the upload if thumbnail creation fails
      }
    }

    return NextResponse.json({ assetId, versionId }, { status: 201 });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset upload failed', err);
    return NextResponse.json({ error: err.message || 'Asset upload failed' }, { status: 500 });
  }
}
