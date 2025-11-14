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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Handle both sync and async params (Next.js 14/15 compatibility)
    const resolvedParams = params instanceof Promise ? await params : params;
    const assetId = resolvedParams.id;
    
    console.log('Complete route called for asset:', assetId);
    
    const adminUserId = await getAdminUser(request);

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();

    console.log('Complete route body:', {
      storagePath: body.storagePath,
      fileType: body.fileType,
      fileName: body.fileName,
      fileSize: body.fileSize,
      hasThumbnail: !!body.thumbnailData,
    });

    if (!body.storagePath) {
      console.error('Missing storagePath in complete request');
      return NextResponse.json({ error: 'Missing storagePath' }, { status: 400 });
    }

    // Get file info from storage (optional - use provided fileSize if available)
    const fileName = body.storagePath.split('/').pop() || '';
    let fileSize: number | null = body.fileSize ?? null;
    
    try {
      const { data: fileInfo, error: fileInfoError } = await supabaseAdmin.storage
        .from('dam-assets')
        .list(assetId, {
          limit: 100,
        });

      if (fileInfoError) {
        console.warn('Failed to get file info from storage (using provided size):', fileInfoError);
      } else if (fileInfo && fileInfo.length > 0) {
        const file = fileInfo.find((f) => f.name === fileName);
        if (file?.metadata?.size) {
          fileSize = file.metadata.size;
          console.log('File size from storage:', fileSize);
        }
      }
    } catch (storageListError) {
      console.warn('Error listing storage files (using provided size):', storageListError);
    }

    // Get latest version number
    const { data: lastVersion, error: lastVersionError } = await supabaseAdmin
      .from('dam_asset_versions')
      .select('version_number')
      .eq('asset_id', assetId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (lastVersionError) {
      console.error('Error fetching last version:', lastVersionError);
      throw lastVersionError;
    }
    
    const nextVersionNumber = lastVersion ? Number(lastVersion.version_number) + 1 : 1;
    const versionId = randomUUID();
    
    console.log('Creating version:', {
      assetId,
      versionId,
      versionNumber: nextVersionNumber,
      storagePath: body.storagePath,
    });

    // Create version record
    const versionData = {
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
      processing_status: 'complete' as const, // Set to complete immediately - no background processing
      created_by: adminUserId,
    };
    
    console.log('Inserting version record:', versionData);
    
    const { error: insertVersionError } = await supabaseAdmin.from('dam_asset_versions').insert([versionData]);

    if (insertVersionError) {
      console.error('Error inserting version:', insertVersionError);
      throw insertVersionError;
    }
    
    console.log('Version record created successfully');

    // Handle thumbnail if provided (thumbnail already uploaded to storage, we just need to link it)
    if (body.thumbnailPath && versionId) {
      console.log('Linking thumbnail to version:', body.thumbnailPath);
      try {
        // Get thumbnail file size from storage
        const { data: thumbFile, error: thumbFileError } = await supabaseAdmin.storage
          .from('dam-assets')
          .list(assetId, {
            limit: 100,
          });
        
        let thumbFileSize: number | null = null;
        if (!thumbFileError && thumbFile) {
          const thumbFileName = body.thumbnailPath.split('/').pop();
          const thumbFileInfo = thumbFile.find((f) => f.name === thumbFileName);
          if (thumbFileInfo?.metadata?.size) {
            thumbFileSize = thumbFileInfo.metadata.size;
          }
        }

        // Update version with thumbnail path
        await supabaseAdmin
          .from('dam_asset_versions')
          .update({ thumbnail_path: body.thumbnailPath })
          .eq('id', versionId);

        // Create rendition record
        const { error: renditionError } = await supabaseAdmin
          .from('dam_asset_renditions')
          .insert({
            asset_id: assetId,
            version_id: versionId,
            kind: 'thumb',
            storage_bucket: 'dam-assets',
            storage_path: body.thumbnailPath,
            mime_type: 'image/png',
            file_size: thumbFileSize,
            metadata: {},
            created_by: adminUserId,
          });

        if (renditionError) {
          console.error('Failed to create thumbnail rendition:', renditionError);
          // Don't fail the upload if thumbnail creation fails
        } else {
          console.log('Thumbnail rendition created successfully');
        }
      } catch (thumbError: any) {
        console.error('Error linking thumbnail:', thumbError);
        // Don't fail the upload if thumbnail linking fails
      }
    } else {
      console.log('No thumbnail path provided');
    }

    return NextResponse.json({ assetId, versionId }, { status: 200 });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset complete failed', err);
    return NextResponse.json({ error: err.message || 'Asset complete failed' }, { status: 500 });
  }
}

