// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const BUCKET_ID = 'dam-assets';

interface StoragePayload {
  type: 'INSERT' | 'UPDATE';
  table: string;
  record: {
    asset_id: string;
    id: string;
    storage_path: string;
    storage_bucket: string;
    mime_type: string | null;
    processing_status: string;
  };
}

async function updateProcessingStatus(
  supabaseAdmin: any,
  versionId: string,
  status: string,
  updates: Record<string, unknown> = {},
) {
  const { error } = await supabaseAdmin
    .from('dam_asset_versions')
    .update({ processing_status: status, ...updates })
    .eq('id', versionId);

  if (error) {
    console.error('Failed to update processing status', error);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Supabase environment variables are missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = (await req.json()) as StoragePayload;
  if (!payload?.record?.id || payload.record.storage_bucket !== BUCKET_ID) {
    return new Response(JSON.stringify({ message: 'Ignored' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const versionId = payload.record.id;

  await updateProcessingStatus(supabaseAdmin, versionId, 'processing');

  try {
    const { data: version, error: versionError } = await supabaseAdmin
      .from('dam_asset_versions')
      .select('*')
      .eq('id', versionId)
      .maybeSingle();

    if (versionError || !version) {
      throw new Error(versionError?.message ?? 'Version not found');
    }

    const mergedMetadata = {
      ...(version.metadata ?? {}),
      processingNotes: 'Placeholder processing complete (no-op).',
      processedAt: new Date().toISOString(),
    };

    // TODO: Implement actual media processing (thumbnails, PDF parsing, etc.).
    await updateProcessingStatus(supabaseAdmin, versionId, 'complete', {
      metadata: mergedMetadata,
      extracted_text: version.extracted_text ?? null,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('dam-process error', err);
    await updateProcessingStatus(supabaseAdmin, versionId, 'failed', {
      metadata: {
        error: err instanceof Error ? err.message : 'Unexpected error',
        failedAt: new Date().toISOString(),
      },
    });

    return new Response(JSON.stringify({ error: 'Processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
