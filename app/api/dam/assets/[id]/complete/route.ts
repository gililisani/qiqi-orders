import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { createAuth } from '../../../../../../platform/auth';
// Queue removed - all processing now happens client-side

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

async function getAdminUser(request: NextRequest): Promise<string> {
  const auth = createAuth();
  const adminUser = await auth.requireRole(request, 'admin');
  return adminUser.id;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const adminUserId = await getAdminUser(request);

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();

    if (!body.storagePath) {
      return NextResponse.json({ error: 'Missing storagePath' }, { status: 400 });
    }

    const assetId = params.id;

    // Get file info from storage
    const fileName = body.storagePath.split('/').pop() || '';
    const { data: fileInfo, error: fileInfoError } = await supabaseAdmin.storage
      .from('dam-assets')
      .list(assetId, {
        limit: 100,
      });

    let fileSize: number | null = body.fileSize ?? null;
    if (fileInfoError) {
      console.error('Failed to get file info:', fileInfoError);
    } else if (fileInfo && fileInfo.length > 0) {
      const file = fileInfo.find((f) => f.name === fileName);
      if (file?.metadata?.size) {
        fileSize = file.metadata.size;
      }
    }

    // Get latest version number
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

    // Create version record
    const { error: insertVersionError } = await supabaseAdmin.from('dam_asset_versions').insert([
      {
        id: versionId,
        asset_id: assetId,
        version_number: nextVersionNumber,
        storage_bucket: 'dam-assets',
        storage_path: body.storagePath,
        file_size: fileSize,
        checksum: null,
        mime_type: body.fileType || 'application/octet-stream',
        metadata: {
          originalFileName: fileName,
        },
        processing_status: 'complete', // Set to complete immediately - no background processing
        created_by: adminUserId,
      },
    ]);

    if (insertVersionError) throw insertVersionError;

    // Handle thumbnail if provided (from client-side PDF thumbnail generation)
    if (body.thumbnailData && versionId) {
      const storage = (await import('../../../../../../platform/storage')).createStorage();
      // Generate proper thumbnail path with asset ID
      const finalThumbnailPath = `${assetId}/${Date.now()}-thumb.png`;
      const thumbnailBytes = Uint8Array.from(atob(body.thumbnailData), (c) => c.charCodeAt(0));
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
          created_by: adminUserId,
        });

      if (renditionError) {
        console.error('Failed to create thumbnail rendition:', renditionError);
        // Don't fail the upload if thumbnail creation fails
      }
    }

    return NextResponse.json({ assetId, versionId }, { status: 200 });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset complete failed', err);
    return NextResponse.json({ error: err.message || 'Asset complete failed' }, { status: 500 });
  }
}

