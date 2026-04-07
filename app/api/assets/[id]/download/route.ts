import { NextRequest, NextResponse } from 'next/server';
import { createStorage } from '../../../../../platform/storage';
import { createServiceRoleClient, requireAnyRole } from '../../../../../platform/auth/guards';
import { assertDamAssetDeliveryEntitlement } from '../../../../../platform/auth/damAssetAccess';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAnyRole(request, ['admin', 'client']);
    const supabaseAdmin = createServiceRoleClient();
    const isAdmin = user.roles.includes('admin');

    const versionId = request.nextUrl.searchParams.get('version');
    const rendition = request.nextUrl.searchParams.get('rendition');
    if (!versionId) {
      return NextResponse.json({ error: 'Missing version parameter' }, { status: 400 });
    }

    // Fetch version without embed to avoid relationship ambiguity
    const { data: version, error: versionError } = await supabaseAdmin
      .from('dam_asset_versions')
      .select('*')
      .eq('id', versionId)
      .maybeSingle();

    if (versionError) {
      console.error('Version fetch error:', versionError);
      throw versionError;
    }
    if (!version) {
      return NextResponse.json({ error: 'Asset version not found' }, { status: 404 });
    }

    // Fetch asset separately to avoid relationship ambiguity
    // Try to get use_title_as_filename, but handle gracefully if column doesn't exist
    let useTitleAsFilename = false;
    let validatedAsset: { id: string; is_archived: boolean } | null = null;
    try {
      const { data: asset, error: assetError } = await supabaseAdmin
        .from('dam_assets')
        .select('id, is_archived, title, use_title_as_filename')
        .eq('id', version.asset_id)
        .maybeSingle();
      
      if (assetError) {
        console.error('Asset fetch error:', assetError);
        throw assetError;
      }
      if (!asset) {
        return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
      }
      
      if (asset.id !== params.id) {
        return NextResponse.json({ error: 'Asset mismatch' }, { status: 404 });
      }
      
      if (asset.is_archived) {
        return NextResponse.json({ error: 'Asset archived' }, { status: 410 });
      }
      
      validatedAsset = { id: asset.id, is_archived: asset.is_archived };
      useTitleAsFilename = (asset as any).use_title_as_filename ?? false;
    } catch (err: any) {
      // If column doesn't exist, try without it
      const { data: asset, error: assetError } = await supabaseAdmin
        .from('dam_assets')
        .select('id, is_archived, title')
        .eq('id', version.asset_id)
        .maybeSingle();
      
      if (assetError) {
        console.error('Asset fetch error:', assetError);
        throw assetError;
      }
      if (!asset) {
        return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
      }
      
      if (asset.id !== params.id) {
        return NextResponse.json({ error: 'Asset mismatch' }, { status: 404 });
      }
      
      if (asset.is_archived) {
        return NextResponse.json({ error: 'Asset archived' }, { status: 410 });
      }
      
      validatedAsset = { id: asset.id, is_archived: asset.is_archived };
      useTitleAsFilename = false; // Default to false if column doesn't exist
    }

    const entitlement = await assertDamAssetDeliveryEntitlement(
      supabaseAdmin,
      { userId: user.id, isAdmin },
      validatedAsset!,
      params.id,
      { id: version.id, asset_id: version.asset_id }
    );
    if (entitlement) return entitlement;
    
    // Re-fetch asset for title (we already validated existence and archived status above)
    const { data: asset, error: assetTitleError } = await supabaseAdmin
      .from('dam_assets')
      .select('id, title')
      .eq('id', version.asset_id)
      .single();

    if (assetTitleError || !asset) {
      console.error('Asset title fetch error:', assetTitleError);
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    if (asset.id !== params.id) {
      return NextResponse.json({ error: 'Asset mismatch' }, { status: 404 });
    }
    
    // Note: is_archived was already checked in the try-catch block above

    let targetPath: string | null = version.storage_path;
    if (rendition === 'thumbnail' && version.thumbnail_path) {
      targetPath = version.thumbnail_path;
    }

    if (!targetPath) {
      return NextResponse.json({ error: 'Rendition unavailable' }, { status: 404 });
    }

    const storage = createStorage();
    const metadata = (version.metadata ?? {}) as Record<string, any>;
    
    // Determine download filename: use title if flag is set, otherwise use original filename
    let downloadName: string | undefined = undefined;
    if (useTitleAsFilename && asset?.title) {
      // Use title as filename - get extension from original filename if available
      const originalFileName = typeof metadata.originalFileName === 'string' ? metadata.originalFileName : '';
      const extension = originalFileName ? originalFileName.split('.').pop() : '';
      downloadName = extension ? `${asset.title}.${extension}` : asset.title;
    } else if (typeof metadata.originalFileName === 'string') {
      // Use original filename
      downloadName = metadata.originalFileName;
    }
    
    try {
      const signedUrl = await storage.getSignedUrl(targetPath, {
        expiresIn: 5 * 60,
        downloadName,
      });
      const wantsJson =
        request.nextUrl.searchParams.get('format') === 'json' ||
        (request.headers.get('accept') ?? '').includes('application/json');
      if (wantsJson) {
        return NextResponse.json({ url: signedUrl, expiresIn: 5 * 60 }, { status: 200 });
      }
      return NextResponse.redirect(signedUrl, { status: 302 });
    } catch (storageError: any) {
      console.error('Storage error generating download URL', {
        message: storageError?.message,
        targetPath,
        versionId: version.id,
        assetId: version.asset_id,
      });
      throw new Error(`Failed to generate signed URL: ${storageError.message}`);
    }
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('Download route error', err);
    return NextResponse.json({ error: err.message || 'Failed to generate download link' }, { status: 500 });
  }
}
