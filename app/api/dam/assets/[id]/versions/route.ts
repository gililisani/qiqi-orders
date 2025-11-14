import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAuth } from '../../../../../../platform/auth';

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

function buildDownloadPath(assetId: string, versionId: string, rendition?: 'thumbnail' | 'original') {
  const base = `/api/assets/${assetId}/download?version=${versionId}`;
  if (rendition === 'thumbnail') {
    return `${base}&rendition=thumbnail`;
  }
  return base;
}

function buildPreviewPath(assetId: string, versionId: string, rendition?: 'thumbnail' | 'original') {
  const base = `/api/assets/${assetId}/preview?version=${versionId}`;
  if (rendition === 'thumbnail') {
    return `${base}&rendition=thumbnail`;
  }
  return base;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const resolvedParams = params instanceof Promise ? await params : params;
    const assetId = resolvedParams.id;

    const supabaseAdmin = createSupabaseAdminClient();

    const { data: versions, error } = await supabaseAdmin
      .from('dam_asset_versions')
      .select(
        'id, asset_id, version_number, storage_path, thumbnail_path, mime_type, file_size, processing_status, created_at, metadata, duration_seconds, width, height'
      )
      .eq('asset_id', assetId)
      .order('version_number', { ascending: false });

    if (error) throw error;

    const versionsWithPaths = (versions || []).map((version) => ({
      ...version,
      downloadPath: buildDownloadPath(assetId, version.id, 'original'),
      previewPath: buildPreviewPath(
        assetId,
        version.id,
        version.thumbnail_path ? 'thumbnail' : 'original'
      ),
    }));

    return NextResponse.json({ versions: versionsWithPaths });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Failed to fetch versions', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch versions' }, { status: 500 });
  }
}

