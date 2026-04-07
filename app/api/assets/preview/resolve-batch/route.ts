import { NextRequest, NextResponse } from 'next/server';
import { createStorage } from '../../../../../platform/storage';
import { createServiceRoleClient, requireAnyRole } from '../../../../../platform/auth/guards';
import { assertDamAssetDeliveryEntitlement } from '../../../../../platform/auth/damAssetAccess';

type Body = {
  paths?: string[];
};

function normalizeApiPath(p: string): string {
  if (!p) return '';
  if (p.startsWith('http://') || p.startsWith('https://')) return '';
  return p.startsWith('/') ? p : `/${p}`;
}

type ParsedPreviewPath =
  | { ok: true; assetId: string; versionId: string; rendition: string | null }
  | { ok: false };

function parsePreviewPath(path: string): ParsedPreviewPath {
  // Expected: /api/assets/:assetId/preview?version=...&rendition=thumbnail|original
  try {
    const url = new URL(path, 'http://local');
    const m = url.pathname.match(/^\/api\/assets\/([^/]+)\/preview$/);
    if (!m?.[1]) return { ok: false };
    const versionId = url.searchParams.get('version') || '';
    if (!versionId) return { ok: false };
    return {
      ok: true,
      assetId: m[1],
      versionId,
      rendition: url.searchParams.get('rendition'),
    };
  } catch {
    return { ok: false };
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAnyRole(request, ['admin', 'client']);
    const isAdmin = user.roles.includes('admin');
    const supabaseAdmin = createServiceRoleClient();
    const storage = createStorage();

    const body = (await request.json().catch(() => null)) as Body | null;
    const inputPaths = Array.isArray(body?.paths) ? body!.paths : [];

    // Hard cap to avoid abuse (thumbnails are per-page; this should be small).
    const uniquePaths = Array.from(
      new Set(
        inputPaths
          .map((p) => (typeof p === 'string' ? normalizeApiPath(p) : ''))
          .filter(Boolean)
      )
    ).slice(0, 100);

    const urls: Record<string, string> = {};
    if (uniquePaths.length === 0) {
      return NextResponse.json({ urls }, { status: 200 });
    }

    for (const path of uniquePaths) {
      const parsed = parsePreviewPath(path);
      if (!parsed.ok) continue;

      // Fetch version
      const { data: version, error: versionError } = await supabaseAdmin
        .from('dam_asset_versions')
        .select('*')
        .eq('id', parsed.versionId)
        .maybeSingle();
      if (versionError || !version) continue;

      // Fetch asset
      const { data: asset, error: assetError } = await supabaseAdmin
        .from('dam_assets')
        .select('id, is_archived')
        .eq('id', version.asset_id)
        .maybeSingle();
      if (assetError || !asset) continue;

      // Validate path assetId matches the version's asset
      if (asset.id !== parsed.assetId) continue;
      if (asset.is_archived) continue;

      const entitlement = await assertDamAssetDeliveryEntitlement(
        supabaseAdmin,
        { userId: user.id, isAdmin },
        { id: asset.id, is_archived: asset.is_archived },
        parsed.assetId,
        { id: version.id, asset_id: version.asset_id }
      );
      if (entitlement) continue;

      let targetPath: string | null = version.storage_path;
      if (parsed.rendition === 'thumbnail' && version.thumbnail_path) {
        targetPath = version.thumbnail_path;
      }
      if (!targetPath) continue;

      const signedUrl = await storage.getSignedUrl(targetPath, { expiresIn: 5 * 60 });
      urls[path] = signedUrl;
    }

    return NextResponse.json({ urls }, { status: 200 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err.message || 'Failed to resolve preview URLs' }, { status: 500 });
  }
}

