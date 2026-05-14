import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { createAuth } from '../../../../../platform/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ALLOWED_ASSET_TYPES = new Set(['image', 'video', 'document', 'audio', 'other']);
const MIME_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_TITLE = 500;
const MAX_DESCRIPTION = 5000;
const MAX_FILENAME = 255;
const MAX_MIME = 255;
const MAX_TAG_LEN = 200;
const MAX_ARRAY = 100;

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Strip path separators, control chars, and trim. */
function sanitizeFileName(input: string): string {
  return input
    .replace(/[\\/]/g, '_')
    .replace(/\.\.+/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .slice(0, MAX_FILENAME);
}

function sanitizeStringArray(input: unknown, maxLen = MAX_TAG_LEN): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= maxLen)
    .slice(0, MAX_ARRAY);
}

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

export async function POST(request: NextRequest) {
  try {
    const auth = createAuth();
    const adminUser = await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();

    const titleRaw = asString(body.title)?.trim();
    const assetTypeRaw = asString(body.assetType)?.trim().toLowerCase();
    const fileNameRaw = asString(body.fileName);
    const fileTypeRaw = asString(body.fileType)?.trim();

    if (!titleRaw || !assetTypeRaw || !fileNameRaw || !fileTypeRaw) {
      return NextResponse.json({ error: 'Missing required fields: title, assetType, fileName, fileType' }, { status: 400 });
    }

    if (titleRaw.length > MAX_TITLE) {
      return NextResponse.json({ error: 'Title exceeds maximum length' }, { status: 400 });
    }

    if (!ALLOWED_ASSET_TYPES.has(assetTypeRaw)) {
      return NextResponse.json({ error: 'Invalid assetType' }, { status: 400 });
    }

    const fileName = sanitizeFileName(fileNameRaw);
    if (!fileName) {
      return NextResponse.json({ error: 'Invalid fileName' }, { status: 400 });
    }

    if (fileTypeRaw.length > MAX_MIME || !MIME_PATTERN.test(fileTypeRaw)) {
      return NextResponse.json({ error: 'Invalid fileType (must be a MIME type)' }, { status: 400 });
    }

    const descriptionRaw = asString(body.description);
    if (descriptionRaw && descriptionRaw.length > MAX_DESCRIPTION) {
      return NextResponse.json({ error: 'Description exceeds maximum length' }, { status: 400 });
    }

    const incomingAssetId = asString(body.assetId);
    if (incomingAssetId && !UUID_PATTERN.test(incomingAssetId)) {
      return NextResponse.json({ error: 'Invalid assetId' }, { status: 400 });
    }
    const assetTypeIdRaw = asString(body.assetTypeId);
    if (assetTypeIdRaw && !UUID_PATTERN.test(assetTypeIdRaw)) {
      return NextResponse.json({ error: 'Invalid assetTypeId' }, { status: 400 });
    }
    const assetSubtypeIdRaw = asString(body.assetSubtypeId);
    if (assetSubtypeIdRaw && !UUID_PATTERN.test(assetSubtypeIdRaw)) {
      return NextResponse.json({ error: 'Invalid assetSubtypeId' }, { status: 400 });
    }
    const campaignIdRaw = asString(body.campaignId);
    if (campaignIdRaw && !UUID_PATTERN.test(campaignIdRaw)) {
      return NextResponse.json({ error: 'Invalid campaignId' }, { status: 400 });
    }

    const assetId: string = incomingAssetId || randomUUID();
    const tagsInput = sanitizeStringArray(body.tags);
    const audiencesInput = sanitizeStringArray(body.audiences);
    const regionsInput = sanitizeStringArray(body.regions);

    const localesInput: Array<{ code: string; primary?: boolean }> = Array.isArray(body.locales)
      ? body.locales
          .filter((l: any) => l && typeof l.code === 'string')
          .map((l: any) => ({
            code: String(l.code).trim().slice(0, MAX_TAG_LEN),
            primary: Boolean(l.primary),
          }))
          .filter((l: { code: string }) => l.code.length > 0)
          .slice(0, MAX_ARRAY)
      : [];

    // Sync asset_type enum with asset_type_id if provided
    let syncedAssetType = assetTypeRaw;
    if (assetTypeIdRaw) {
      const { data: assetTypeData } = await supabaseAdmin
        .from('dam_asset_types')
        .select('slug')
        .eq('id', assetTypeIdRaw)
        .single();
      if (assetTypeData) {
        const slugToEnumMap: Record<string, string> = {
          'image': 'image',
          'video': 'video',
          'document': 'document',
          'artwork': 'document',
          'audio': 'audio',
          'packaging-regulatory': 'document',
          'campaign': 'document',
        };
        syncedAssetType = slugToEnumMap[assetTypeData.slug] || assetTypeRaw || 'other';
      }
    }

    const productLine = asString(body.productLine)?.trim().slice(0, MAX_TAG_LEN) || null;
    const productName = asString(body.productName)?.trim().slice(0, MAX_TAG_LEN) || null;
    const sku = asString(body.sku)?.trim().slice(0, MAX_TAG_LEN) || null;

    if (!incomingAssetId) {
      const insertData: any = {
        id: assetId,
        title: titleRaw,
        description: descriptionRaw ?? null,
        asset_type: syncedAssetType,
        asset_type_id: assetTypeIdRaw ?? null,
        asset_subtype_id: assetSubtypeIdRaw ?? null,
        product_line: productLine,
        product_name: productName,
        sku,
        search_tags: tagsInput,
        created_by: adminUser.id,
        updated_by: adminUser.id,
      };

      if (body.useTitleAsFilename !== undefined) {
        insertData.use_title_as_filename = Boolean(body.useTitleAsFilename);
      }

      const { error: insertAssetError } = await supabaseAdmin.from('dam_assets').insert(insertData);
      if (insertAssetError) throw insertAssetError;
    } else {
      const updateData: any = {
        title: titleRaw,
        description: descriptionRaw ?? null,
        asset_type: syncedAssetType,
        asset_type_id: assetTypeIdRaw ?? null,
        asset_subtype_id: assetSubtypeIdRaw ?? null,
        product_line: productLine,
        product_name: productName,
        sku,
        search_tags: tagsInput,
        updated_by: adminUser.id,
        updated_at: new Date().toISOString(),
      };

      if (body.useTitleAsFilename !== undefined) {
        updateData.use_title_as_filename = Boolean(body.useTitleAsFilename);
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

    await supabaseAdmin.from('dam_asset_audience_map').delete().eq('asset_id', assetId);
    if (audiencesInput.length > 0) {
      const { data: audienceRows, error: audienceError } = await supabaseAdmin
        .from('dam_audiences')
        .select('id, code')
        .in('code', audiencesInput);
      if (audienceError) throw audienceError;
      const audienceMaps = (audienceRows ?? []).map((row) => ({ asset_id: assetId, audience_id: row.id }));
      if (audienceMaps.length > 0) {
        const { error: audienceMapError } = await supabaseAdmin.from('dam_asset_audience_map').insert(audienceMaps);
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

    if (campaignIdRaw) {
      await supabaseAdmin.from('campaign_assets').delete().eq('asset_id', assetId);
      const { error: campaignError } = await supabaseAdmin
        .from('campaign_assets')
        .insert({ campaign_id: campaignIdRaw, asset_id: assetId });
      if (campaignError) {
        console.error('Failed to link asset to campaign:', campaignError);
      }
    }

    // Storage path uses the sanitized filename.
    const storagePath = `${assetId}/${Date.now()}-${fileName}`;

    return NextResponse.json({ assetId, storagePath }, { status: 200 });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset init failed', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
    });
    return NextResponse.json({ error: err.message || 'Asset init failed' }, { status: 500 });
  }
}

