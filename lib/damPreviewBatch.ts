/**
 * DAM thumbnail batch signing — pure planning for /api/assets/preview/resolve-batch.
 *
 * A grid page asks for up to 100 preview paths at once. The route loads every
 * version and asset in two queries, runs the caller-level access check once,
 * and signs all storage objects in ONE storage call. (It used to do three
 * queries + one storage sign per path, sequentially; cards raced it with their
 * own per-card signs, and the burst exhausted Supabase Storage's connection
 * pool in production — Sentry "Too many connections issued to the database".)
 */

export type ParsedPreviewPath = {
  apiPath: string;
  assetId: string;
  versionId: string;
  rendition: string | null;
};

export type PreviewVersionRow = {
  id: string;
  asset_id: string;
  storage_path: string | null;
  thumbnail_path: string | null;
};

export type PreviewAssetRow = { id: string; is_archived: boolean | null };

/** Same-origin API path ("/api/..."); absolute URLs are rejected (''). */
export function normalizeApiPath(p: string): string {
  if (!p) return '';
  if (p.startsWith('http://') || p.startsWith('https://')) return '';
  return p.startsWith('/') ? p : `/${p}`;
}

/** Expected: /api/assets/:assetId/preview?version=...&rendition=thumbnail|original */
export function parsePreviewPath(apiPath: string): ParsedPreviewPath | null {
  try {
    const url = new URL(apiPath, 'http://local');
    const m = url.pathname.match(/^\/api\/assets\/([^/]+)\/preview$/);
    if (!m?.[1]) return null;
    const versionId = url.searchParams.get('version') || '';
    if (!versionId) return null;
    return { apiPath, assetId: m[1], versionId, rendition: url.searchParams.get('rendition') };
  } catch {
    return null;
  }
}

/**
 * apiPath → storage object path for every request that passes the per-asset
 * checks the single preview route makes: version exists, belongs to the asset
 * in the path, asset exists and is not archived, rendition has a file.
 * Anything failing is left out (the card shows its fallback).
 */
export function planPreviewTargets(
  requests: ParsedPreviewPath[],
  versionsById: Map<string, PreviewVersionRow>,
  assetsById: Map<string, PreviewAssetRow>
): Map<string, string> {
  const targets = new Map<string, string>();
  for (const req of requests) {
    const version = versionsById.get(req.versionId);
    if (!version || version.asset_id !== req.assetId) continue;
    const asset = assetsById.get(version.asset_id);
    if (!asset || asset.is_archived) continue;
    const target =
      req.rendition === 'thumbnail' && version.thumbnail_path ? version.thumbnail_path : version.storage_path;
    if (!target) continue;
    targets.set(req.apiPath, target);
  }
  return targets;
}
