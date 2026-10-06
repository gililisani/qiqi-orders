import { NextRequest, NextResponse } from 'next/server';
import { createStorage } from '../../../../../platform/storage';
import { createServiceRoleClient, requireAnyRole } from '../../../../../platform/auth/guards';
import { assertDamDeliveryAccess } from '../../../../../platform/auth/damAssetAccess';
import {
  normalizeApiPath,
  parsePreviewPath,
  planPreviewTargets,
  type ParsedPreviewPath,
  type PreviewAssetRow,
  type PreviewVersionRow,
} from '@/lib/damPreviewBatch';

type Body = {
  paths?: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const user = await requireAnyRole(request, ['admin', 'client']);
    const isAdmin = user.roles.includes('admin');
    const supabaseAdmin = createServiceRoleClient();

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
    // Ids go into one `in (...)` filter — a malformed id would fail the whole
    // query, so drop it here (it could never match a row anyway).
    const requests = uniquePaths
      .map(parsePreviewPath)
      .filter((r): r is ParsedPreviewPath => !!r && UUID_RE.test(r.versionId) && UUID_RE.test(r.assetId));
    if (requests.length === 0) {
      return NextResponse.json({ urls }, { status: 200 });
    }

    const denied = await assertDamDeliveryAccess(supabaseAdmin, { userId: user.id, isAdmin });
    if (denied) return denied;

    const { data: versions, error: versionError } = await supabaseAdmin
      .from('dam_asset_versions')
      .select('id, asset_id, storage_path, thumbnail_path')
      .in('id', Array.from(new Set(requests.map((r) => r.versionId))));
    if (versionError) throw versionError;

    const versionsById = new Map<string, PreviewVersionRow>(
      ((versions ?? []) as PreviewVersionRow[]).map((v) => [v.id, v])
    );
    const assetIds = Array.from(new Set(Array.from(versionsById.values()).map((v) => v.asset_id)));
    const assetsById = new Map<string, PreviewAssetRow>();
    if (assetIds.length > 0) {
      const { data: assets, error: assetError } = await supabaseAdmin
        .from('dam_assets')
        .select('id, is_archived')
        .in('id', assetIds);
      if (assetError) throw assetError;
      for (const a of (assets ?? []) as PreviewAssetRow[]) assetsById.set(a.id, a);
    }

    const targets = planPreviewTargets(requests, versionsById, assetsById);
    if (targets.size === 0) {
      return NextResponse.json({ urls }, { status: 200 });
    }

    // One storage call for the whole page (see lib/damPreviewBatch.ts).
    const signed = await createStorage().getSignedUrls(Array.from(new Set(targets.values())), {
      expiresIn: 5 * 60,
    });
    for (const [apiPath, target] of targets) {
      if (signed[target]) urls[apiPath] = signed[target];
    }

    return NextResponse.json({ urls }, { status: 200 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('Preview batch error', { message: err?.message });
    return NextResponse.json({ error: err.message || 'Failed to resolve preview URLs' }, { status: 500 });
  }
}
