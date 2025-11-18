import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
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

export async function POST(request: NextRequest) {
  try {
    const auth = createAuth();
    const adminUser = await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();

    if (!body.title || !body.assetType || !body.fileName || !body.fileType) {
      console.error('Missing required fields:', {
        title: !!body.title,
        assetType: !!body.assetType,
        fileName: !!body.fileName,
        fileType: !!body.fileType,
      });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const assetId: string = body.assetId || randomUUID();
    const tagsInput: string[] = Array.isArray(body.tags) ? body.tags : [];
    const audiencesInput: string[] = Array.isArray(body.audiences) ? body.audiences : [];
    const localesInput: Array<{ code: string; primary?: boolean }> = Array.isArray(body.locales)
      ? body.locales
      : [];
    const regionsInput: string[] = Array.isArray(body.regions) ? body.regions : [];

    // Sync asset_type enum with asset_type_id if provided
    let syncedAssetType = body.assetType;
    if (body.assetTypeId) {
      // Get the slug from asset_type_id to sync with enum
      const { data: assetTypeData } = await supabaseAdmin
        .from('dam_asset_types')
        .select('slug')
        .eq('id', body.assetTypeId)
        .single();
      if (assetTypeData) {
        // Map taxonomy slugs to enum values
        const slugToEnumMap: Record<string, string> = {
          'image': 'image',
          'video': 'video',
          'document': 'document',
          'artwork': 'document',
          'audio': 'audio',
          'packaging-regulatory': 'document',
          'campaign': 'document',
        };
        syncedAssetType = slugToEnumMap[assetTypeData.slug] || body.assetType || 'other';
      }
    }

    if (!body.assetId) {
      const insertData: any = {
        id: assetId,
        title: body.title,
        description: body.description ?? null,
        asset_type: syncedAssetType,
        asset_type_id: body.assetTypeId ?? null,
        asset_subtype_id: body.assetSubtypeId ?? null,
        product_line: body.productLine ?? null,
        product_name: body.productName ?? null,
        sku: body.sku ?? null,
        search_tags: tagsInput,
        created_by: adminUser.id,
        updated_by: adminUser.id,
      };
      
      // Only include use_title_as_filename if column exists (will be added after migration)
      if (body.useTitleAsFilename !== undefined) {
        insertData.use_title_as_filename = body.useTitleAsFilename;
      }
      
      const { error: insertAssetError } = await supabaseAdmin.from('dam_assets').insert(insertData);

      if (insertAssetError) throw insertAssetError;
    } else {
      const updateData: any = {
        title: body.title,
        description: body.description ?? null,
        asset_type: syncedAssetType,
        asset_type_id: body.assetTypeId ?? null,
        asset_subtype_id: body.assetSubtypeId ?? null,
        product_line: body.productLine ?? null,
        product_name: body.productName ?? null,
        sku: body.sku ?? null,
        search_tags: tagsInput,
        updated_by: adminUser.id,
        updated_at: new Date().toISOString(),
      };
      
      // Only include use_title_as_filename if provided (column may not exist yet)
      if (body.useTitleAsFilename !== undefined) {
        updateData.use_title_as_filename = body.useTitleAsFilename;
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

    // Generate storage path
    const storagePath = `${assetId}/${Date.now()}-${body.fileName}`;

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

