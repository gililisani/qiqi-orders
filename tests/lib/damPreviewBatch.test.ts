import { describe, expect, it } from 'vitest';
import {
  normalizeApiPath,
  parsePreviewPath,
  planPreviewTargets,
  type PreviewAssetRow,
  type PreviewVersionRow,
} from '@/lib/damPreviewBatch';

const A1 = '11111111-1111-1111-1111-111111111111';
const A2 = '22222222-2222-2222-2222-222222222222';
const V1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const V2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const path = (asset: string, version: string, rendition?: string) =>
  `/api/assets/${asset}/preview?version=${version}${rendition ? `&rendition=${rendition}` : ''}`;

describe('parsePreviewPath', () => {
  it('reads asset, version and rendition', () => {
    expect(parsePreviewPath(path(A1, V1, 'thumbnail'))).toEqual({
      apiPath: path(A1, V1, 'thumbnail'),
      assetId: A1,
      versionId: V1,
      rendition: 'thumbnail',
    });
  });

  it('rejects other routes and a missing version', () => {
    expect(parsePreviewPath(`/api/assets/${A1}/download?version=${V1}`)).toBeNull();
    expect(parsePreviewPath(`/api/assets/${A1}/preview`)).toBeNull();
  });

  it('normalizeApiPath refuses absolute URLs', () => {
    expect(normalizeApiPath('https://evil.example/api/assets/x/preview?version=y')).toBe('');
    expect(normalizeApiPath('api/assets/x/preview')).toBe('/api/assets/x/preview');
  });
});

describe('planPreviewTargets', () => {
  const versions = new Map<string, PreviewVersionRow>([
    [V1, { id: V1, asset_id: A1, storage_path: 'a1/original.png', thumbnail_path: 'a1/thumb.png' }],
    [V2, { id: V2, asset_id: A2, storage_path: 'a2/original.pdf', thumbnail_path: null }],
  ]);
  const assets = new Map<string, PreviewAssetRow>([
    [A1, { id: A1, is_archived: false }],
    [A2, { id: A2, is_archived: false }],
  ]);
  const plan = (paths: string[], a = assets) =>
    planPreviewTargets(paths.map((p) => parsePreviewPath(p)!), versions, a);

  it('uses the thumbnail when asked and present, the original otherwise', () => {
    const t = plan([path(A1, V1, 'thumbnail'), path(A1, V1), path(A2, V2, 'thumbnail')]);
    expect(t.get(path(A1, V1, 'thumbnail'))).toBe('a1/thumb.png');
    expect(t.get(path(A1, V1))).toBe('a1/original.png');
    expect(t.get(path(A2, V2, 'thumbnail'))).toBe('a2/original.pdf');
  });

  it('drops a version that belongs to a different asset than the path says', () => {
    expect(plan([path(A2, V1, 'thumbnail')]).size).toBe(0);
  });

  it('drops archived and unknown assets/versions', () => {
    const archived = new Map(assets);
    archived.set(A1, { id: A1, is_archived: true });
    expect(plan([path(A1, V1)], archived).size).toBe(0);
    expect(plan([path(A1, 'cccccccc-cccc-cccc-cccc-cccccccccccc')]).size).toBe(0);
    expect(plan([path(A1, V1)], new Map()).size).toBe(0);
  });
});
