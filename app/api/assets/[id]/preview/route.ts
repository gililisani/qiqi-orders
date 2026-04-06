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
    const { data: asset, error: assetError } = await supabaseAdmin
      .from('dam_assets')
      .select('id, is_archived')
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

    const entitlement = await assertDamAssetDeliveryEntitlement(
      supabaseAdmin,
      { userId: user.id, isAdmin },
      { id: asset.id, is_archived: asset.is_archived },
      params.id,
      { id: version.id, asset_id: version.asset_id }
    );
    if (entitlement) return entitlement;

    let targetPath: string | null = version.storage_path;
    if (rendition === 'thumbnail' && version.thumbnail_path) {
      targetPath = version.thumbnail_path;
    }

    if (!targetPath) {
      return NextResponse.json({ error: 'Rendition unavailable' }, { status: 404 });
    }

    const storage = createStorage();
    
    try {
      // Generate signed URL WITHOUT downloadName to allow preview instead of download
      const signedUrl = await storage.getSignedUrl(targetPath, {
        expiresIn: 5 * 60,
        // No downloadName parameter - this allows browser to preview instead of download
      });
      return NextResponse.redirect(signedUrl, { status: 302 });
    } catch (storageError: any) {
      console.error('Storage error generating preview URL', {
        message: storageError?.message,
        targetPath,
        versionId: version.id,
        assetId: version.asset_id,
      });
      throw new Error(`Failed to generate signed URL: ${storageError.message}`);
    }
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('Preview route error', err);
    return NextResponse.json({ error: err.message || 'Failed to generate preview link' }, { status: 500 });
  }
}

