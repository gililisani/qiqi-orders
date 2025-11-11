// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET_ID = 'dam-assets';

interface UploadRequestBody {
  assetId?: string;
  title: string;
  description?: string;
  assetType: string;
  productLine?: string;
  sku?: string;
  tags?: string[]; // tag slugs
  audiences?: string[]; // audience codes
  locales?: Array<{ code: string; primary?: boolean }>;
  regions?: string[];
  fileName: string;
  fileType: string;
  fileSize?: number;
  checksum?: string;
}

type HandlerResponse = Response | Promise<Response>;

async function ensureAdmin(supabaseAdmin: any) {
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser();

  if (userError || !user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: admin, error: adminError } = await supabaseAdmin
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (adminError || !admin) {
    throw new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return user;
}

async function getNextVersionNumber(supabaseAdmin: any, assetId: string | null): Promise<number> {
  if (!assetId) return 1;

  const { data, error } = await supabaseAdmin
    .from('dam_asset_versions')
    .select('version_number')
    .eq('asset_id', assetId)
    .order('version_number', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to load existing versions: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return 1;
  }

  return (data[0].version_number as number) + 1;
}

async function upsertMappings(
  supabaseAdmin: any,
  assetId: string,
  body: UploadRequestBody,
): Promise<void> {
  const tagSlugs = body.tags ?? [];
  await supabaseAdmin.from('dam_asset_tag_map').delete().eq('asset_id', assetId);
  if (tagSlugs.length > 0) {
    const { data: tags, error } = await supabaseAdmin
      .from('dam_tags')
      .select('id, slug')
      .in('slug', tagSlugs);

    if (error) {
      throw new Error(`Failed to load tags: ${error.message}`);
    }

    const tagMaps = (tags ?? []).map((tag: any) => ({ asset_id: assetId, tag_id: tag.id }));
    if (tagMaps.length > 0) {
      const { error: mapError } = await supabaseAdmin
        .from('dam_asset_tag_map')
        .insert(tagMaps);
      if (mapError) {
        throw new Error(`Failed to map tags: ${mapError.message}`);
      }
    }
  }

  const audienceCodes = body.audiences ?? [];
  await supabaseAdmin.from('dam_asset_audience_map').delete().eq('asset_id', assetId);
  if (audienceCodes.length > 0) {
    const { data: audiences, error } = await supabaseAdmin
      .from('dam_audiences')
      .select('id, code')
      .in('code', audienceCodes);

    if (error) {
      throw new Error(`Failed to load audiences: ${error.message}`);
    }

    const audienceMaps = (audiences ?? []).map((aud: any) => ({ asset_id: assetId, audience_id: aud.id }));
    if (audienceMaps.length > 0) {
      const { error: mapError } = await supabaseAdmin
        .from('dam_asset_audience_map')
        .insert(audienceMaps);
      if (mapError) {
        throw new Error(`Failed to map audiences: ${mapError.message}`);
      }
    }
  }

  const localePayload = body.locales ?? [];
  await supabaseAdmin.from('dam_asset_locale_map').delete().eq('asset_id', assetId);
  if (localePayload.length > 0) {
    const locales = localePayload.map((locale) => ({
      asset_id: assetId,
      locale_code: locale.code,
      is_primary: Boolean(locale.primary),
    }));

    const { error: localeError } = await supabaseAdmin
      .from('dam_asset_locale_map')
      .insert(locales);
    if (localeError) {
      throw new Error(`Failed to map locales: ${localeError.message}`);
    }
  }

  const regionCodes = body.regions ?? [];
  await supabaseAdmin.from('dam_asset_region_map').delete().eq('asset_id', assetId);
  if (regionCodes.length > 0) {
    const regionMaps = regionCodes.map((code) => ({ asset_id: assetId, region_code: code }));
    const { error: regionError } = await supabaseAdmin
      .from('dam_asset_region_map')
      .insert(regionMaps);
    if (regionError) {
      throw new Error(`Failed to map regions: ${regionError.message}`);
    }
  }
}

async function handler(req: Request): HandlerResponse {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Supabase environment variables are missing' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const payload = (await req.json()) as UploadRequestBody;
  if (!payload.title || !payload.assetType || !payload.fileName || !payload.fileType) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const normalizedTags = (payload.tags ?? []).map((slug) => slug.toLowerCase());

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') ?? '',
        'x-client-info': req.headers.get('x-client-info') ?? '',
      },
    },
  });

  try {
    const user = await ensureAdmin(supabaseAdmin);

    const assetId = payload.assetId ?? crypto.randomUUID();
    const isNewAsset = !payload.assetId;

    if (isNewAsset) {
      const { error: assetError } = await supabaseAdmin.from('dam_assets').insert({
        id: assetId,
        title: payload.title,
        description: payload.description ?? null,
        asset_type: payload.assetType,
        product_line: payload.productLine ?? null,
        sku: payload.sku ?? null,
        created_by: user.id,
        updated_by: user.id,
        search_tags: normalizedTags,
      });

      if (assetError) {
        throw new Error(`Failed to create asset: ${assetError.message}`);
      }
    } else {
      const { error: updateError } = await supabaseAdmin
        .from('dam_assets')
        .update({
          title: payload.title,
          description: payload.description ?? null,
          asset_type: payload.assetType,
          product_line: payload.productLine ?? null,
          sku: payload.sku ?? null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
          search_tags: normalizedTags,
        })
        .eq('id', assetId);

      if (updateError) {
        throw new Error(`Failed to update asset: ${updateError.message}`);
      }
    }

    await upsertMappings(supabaseAdmin, assetId, payload);

    const versionNumber = await getNextVersionNumber(supabaseAdmin, payload.assetId ?? null);
    const versionId = crypto.randomUUID();
    const storagePath = `${assetId}/${versionNumber}-${payload.fileName}`;

    const { data: signedUpload, error: signedError } = await supabaseAdmin
      .storage
      .from(BUCKET_ID)
      .createSignedUploadUrl(storagePath);

    if (signedError || !signedUpload) {
      throw new Error(`Failed to create signed upload URL: ${signedError?.message ?? 'Unknown error'}`);
    }

    const { error: versionError } = await supabaseAdmin.from('dam_asset_versions').insert({
      id: versionId,
      asset_id: assetId,
      version_number: versionNumber,
      storage_bucket: BUCKET_ID,
      storage_path: storagePath,
      file_size: payload.fileSize ?? null,
      checksum: payload.checksum ?? null,
      mime_type: payload.fileType,
      created_by: user.id,
      metadata: {
        originalFileName: payload.fileName,
      },
    });

    if (versionError) {
      throw new Error(`Failed to create asset version: ${versionError.message}`);
    }

    const responseBody = {
      assetId,
      versionId,
      versionNumber,
      storagePath,
      uploadUrl: signedUpload.signedUrl,
      token: signedUpload.token,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof Response) {
      return err;
    }

    console.error('dam-upload error', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

Deno.serve(handler);
