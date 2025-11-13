import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAuth } from '../../../../../platform/auth';
import { createStorage } from '../../../../../platform/storage';

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

async function getAdminUser(request: NextRequest): Promise<string> {
  const auth = createAuth();
  const adminUser = await auth.requireRole(request, 'admin');
  return adminUser.id;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const adminUserId = await getAdminUser(request);
    const supabaseAdmin = createSupabaseAdminClient();
    const assetId = params.id;
    const body = await request.json();

    // Update only allowed fields
    const updateData: any = {
      updated_by: adminUserId,
      updated_at: new Date().toISOString(),
    };

    if (body.vimeo_download_1080p !== undefined) updateData.vimeo_download_1080p = body.vimeo_download_1080p;
    if (body.vimeo_download_720p !== undefined) updateData.vimeo_download_720p = body.vimeo_download_720p;
    if (body.vimeo_download_480p !== undefined) updateData.vimeo_download_480p = body.vimeo_download_480p;
    if (body.vimeo_download_360p !== undefined) updateData.vimeo_download_360p = body.vimeo_download_360p;
    if (body.vimeo_video_id !== undefined) updateData.vimeo_video_id = body.vimeo_video_id;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;

    const { data, error } = await supabaseAdmin
      .from('dam_assets')
      .update(updateData)
      .eq('id', assetId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset update failed', err);
    return NextResponse.json({ error: err.message || 'Asset update failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await getAdminUser(request);

    const supabaseAdmin = createSupabaseAdminClient();
    const storage = createStorage();
    const assetId = params.id;

    // Get all versions for this asset
    const { data: versions, error: versionsError } = await supabaseAdmin
      .from('dam_asset_versions')
      .select('storage_path, thumbnail_path, storage_bucket')
      .eq('asset_id', assetId);

    if (versionsError) throw versionsError;

    // Delete all files from storage
    if (versions && versions.length > 0) {
      for (const version of versions) {
        try {
          // Delete main file
          if (version.storage_path) {
            await storage.deleteObject(version.storage_path);
          }
          // Delete thumbnail if exists
          if (version.thumbnail_path) {
            await storage.deleteObject(version.thumbnail_path);
          }
        } catch (storageError) {
          console.error(`Failed to delete storage file ${version.storage_path}:`, storageError);
          // Continue deleting other files even if one fails
        }
      }

      // Also try to delete the entire asset folder from storage
      try {
        const { data: filesInFolder } = await supabaseAdmin.storage
          .from('dam-assets')
          .list(assetId, { limit: 1000 });
        
        if (filesInFolder && filesInFolder.length > 0) {
          const pathsToDelete = filesInFolder.map(f => `${assetId}/${f.name}`);
          for (const path of pathsToDelete) {
            try {
              await storage.deleteObject(path);
            } catch (e) {
              console.error(`Failed to delete ${path}:`, e);
            }
          }
        }
      } catch (folderError) {
        console.error('Failed to delete asset folder:', folderError);
      }
    }

    // Delete associations
    await supabaseAdmin.from('dam_asset_tag_map').delete().eq('asset_id', assetId);
    await supabaseAdmin.from('dam_asset_audience_map').delete().eq('asset_id', assetId);
    await supabaseAdmin.from('dam_asset_locale_map').delete().eq('asset_id', assetId);
    await supabaseAdmin.from('dam_asset_region_map').delete().eq('asset_id', assetId);

    // Delete versions
    await supabaseAdmin.from('dam_asset_versions').delete().eq('asset_id', assetId);

    // Delete asset
    const { error: deleteError } = await supabaseAdmin
      .from('dam_assets')
      .delete()
      .eq('id', assetId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset delete failed', err);
    return NextResponse.json({ error: err.message || 'Asset delete failed' }, { status: 500 });
  }
}

