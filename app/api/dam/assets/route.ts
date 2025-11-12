import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createStorage } from '../../../../platform/storage';
import { randomUUID } from 'crypto';
import { createAuth } from '../../../../platform/auth';
import { createQueue } from '../../../../platform/queue';

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

    const { data: assetsData, error } = await supabaseAdmin
      .from('dam_assets')
      .select(`
        id,
        title,
        description,
        asset_type,
        product_line,
        sku,
        created_at,
        search_tags
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!assetsData || assetsData.length === 0) {
      return NextResponse.json({ assets: [] });
    }

    const assetIds = assetsData.map((record) => record.id);
    const { data: versionsData, error: versionsError } = await supabaseAdmin
      .from('dam_asset_versions')
      .select('id, asset_id, version_number, storage_path, thumbnail_path, mime_type, file_size, processing_status, created_at, metadata')
      .in('asset_id', assetIds)
      .order('version_number', { ascending: false });

    if (versionsError) throw versionsError;

    const versionsByAsset = new Map<string, any>();
    for (const version of versionsData ?? []) {
      if (!versionsByAsset.has(version.asset_id)) {
        versionsByAsset.set(version.asset_id, version);
      }
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

    const { data: audiencesData, error: audiencesError } = await supabaseAdmin
      .from('dam_asset_audience_map')
      .select('asset_id, audience:dam_audiences(label)');
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
        arr.push({ code: regionEntry.code, label: regionEntry.label });
      }
      return acc;
    }, {}) ?? {};

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
            processing_status: currentVersionRaw.processing_status,
            created_at: currentVersionRaw.created_at,
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
    const queue = createQueue();

    const formData = await request.formData();
    const payloadRaw = formData.get('payload');
    const file = formData.get('file');

    if (!payloadRaw || typeof payloadRaw !== 'string') {
      return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const payload = JSON.parse(payloadRaw);

    if (!payload.title || !payload.assetType) {
      return NextResponse.json({ error: 'Missing required metadata' }, { status: 400 });
    }

    const assetId: string = payload.assetId || randomUUID();

    const tagsInput: string[] = Array.isArray(payload.tags) ? payload.tags : [];
    const audiencesInput: string[] = Array.isArray(payload.audiences) ? payload.audiences : [];
    const localesInput: Array<{ code: string; primary?: boolean }> = Array.isArray(payload.locales)
      ? payload.locales
      : [];
    const regionsInput: string[] = Array.isArray(payload.regions) ? payload.regions : [];

    const bytes = new Uint8Array(await file.arrayBuffer());
    const storagePath = `${assetId}/${Date.now()}-${file.name}`;
    await storage.putObject(storagePath, bytes, {
      contentType: file.type || 'application/octet-stream',
      originalFileName: file.name,
    });

    if (!payload.assetId) {
      const { error: insertAssetError } = await supabaseAdmin.from('dam_assets').insert({
        id: assetId,
        title: payload.title,
        description: payload.description ?? null,
        asset_type: payload.assetType,
        product_line: payload.productLine ?? null,
        sku: payload.sku ?? null,
        search_tags: tagsInput,
        created_by: adminUser.id,
        updated_by: adminUser.id,
      });

      if (insertAssetError) throw insertAssetError;
    } else {
      const { error: updateAssetError } = await supabaseAdmin
        .from('dam_assets')
        .update({
          title: payload.title,
          description: payload.description ?? null,
          asset_type: payload.assetType,
          product_line: payload.productLine ?? null,
          sku: payload.sku ?? null,
          search_tags: tagsInput,
          updated_by: adminUser.id,
          updated_at: new Date().toISOString(),
        })
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

    await supabaseAdmin.from('dam_asset_audience_map').delete().eq('asset_id', assetId);
    if (audiencesInput.length > 0) {
      const { data: audienceRows, error: audienceError } = await supabaseAdmin
        .from('dam_audiences')
        .select('id, code')
        .in('code', audiencesInput);
      if (audienceError) throw audienceError;
      const audienceMaps = (audienceRows ?? []).map((row) => ({ asset_id: assetId, audience_id: row.id }));
      if (audienceMaps.length > 0) {
        const { error: audienceMapError } = await supabaseAdmin
          .from('dam_asset_audience_map')
          .insert(audienceMaps);
        if (audienceMapError) throw audienceMapError;
      }
    }

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

    const { data: lastVersion, error: lastVersionError } = await supabaseAdmin
      .from('dam_asset_versions')
      .select('version_number')
      .eq('asset_id', assetId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastVersionError) throw lastVersionError;
    const nextVersionNumber = lastVersion ? Number(lastVersion.version_number) + 1 : 1;
    const versionId = randomUUID();

    const { data: insertedVersion, error: insertVersionError } = await supabaseAdmin
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
          processing_status: 'pending',
          created_by: adminUser.id,
        },
      ])
      .select('id, asset_id, version_number, storage_path, thumbnail_path, mime_type, file_size, processing_status, created_at, metadata')
      .maybeSingle();

    if (insertVersionError) throw insertVersionError;

    if (!versionsByAsset.has(assetId) && insertedVersion) {
      versionsByAsset.set(assetId, insertedVersion);
    }

    await queue.enqueue('dam.process-version', {
      assetId,
      versionId,
    });

    return NextResponse.json({ assetId, versionId }, { status: 201 });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset upload failed', err);
    return NextResponse.json({ error: err.message || 'Asset upload failed' }, { status: 500 });
  }
}
