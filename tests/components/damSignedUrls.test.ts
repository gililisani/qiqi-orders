import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The helpers keep module-level cache / in-flight / throttle state, so every
// test loads a fresh copy.
async function loadUtils() {
  vi.resetModules();
  return import('@/app/components/dam/utils');
}

const thumb = (n: number) => `/api/assets/asset-${n}/preview?version=v-${n}&rendition=thumbnail`;

type Deferred = { resolve: (r: Response) => void };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('DAM signed thumbnail URLs', () => {
  let pending: Array<{ url: string; init?: RequestInit } & Deferred>;

  beforeEach(() => {
    pending = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => new Promise<Response>((resolve) => pending.push({ url, init, resolve })))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('cards rendered while a page batch runs wait for it instead of signing one by one', async () => {
    const { resolveSignedPreviewUrlsBatch, resolveSignedAssetUrl } = await loadUtils();
    const paths = Array.from({ length: 25 }, (_, i) => thumb(i));

    const batch = resolveSignedPreviewUrlsBatch(paths, 'tok');
    const cards = paths.map((p) => resolveSignedAssetUrl(p, 'tok'));
    await flush();

    expect(pending).toHaveLength(1);
    expect(pending[0].url).toBe('/api/assets/preview/resolve-batch');

    pending[0].resolve(json({ urls: Object.fromEntries(paths.map((p) => [p, `https://signed${p}`])) }));
    await batch;
    expect(await Promise.all(cards)).toEqual(paths.map((p) => `https://signed${p}`));
    expect(pending).toHaveLength(1);

    // And they are cached afterwards.
    expect(await resolveSignedAssetUrl(paths[3], 'tok')).toBe(`https://signed${paths[3]}`);
    expect(pending).toHaveLength(1);
  });

  it('if the batch fails, cards fall back to single requests at most 4 at a time', async () => {
    const { resolveSignedPreviewUrlsBatch, resolveSignedAssetUrl } = await loadUtils();
    const paths = Array.from({ length: 10 }, (_, i) => thumb(i));

    const batch = resolveSignedPreviewUrlsBatch(paths, 'tok');
    const cards = paths.map((p) => resolveSignedAssetUrl(p, 'tok'));
    await flush();
    pending.shift()!.resolve(json({ error: 'Too many connections issued to the database' }, 500));
    await batch;
    await flush();

    // Throttled: only 4 single signs in flight.
    expect(pending).toHaveLength(4);
    let served = 0;
    while (pending.length > 0) {
      expect(pending.length).toBeLessThanOrEqual(4);
      const req = pending.shift()!;
      expect(req.url).toContain('format=json');
      req.resolve(json({ url: `https://single${req.url}` }));
      served++;
      await flush();
    }
    expect(served).toBe(10);
    const results = await Promise.all(cards);
    expect(results.every((u) => u.startsWith('https://single/api/assets/'))).toBe(true);
  });

  it('concurrent single lookups of the same asset share one request', async () => {
    const { resolveSignedAssetUrl } = await loadUtils();
    const a = resolveSignedAssetUrl(thumb(1), 'tok');
    const b = resolveSignedAssetUrl(thumb(1), 'tok');
    await flush();
    expect(pending).toHaveLength(1);
    pending[0].resolve(json({ url: 'https://one' }));
    expect(await a).toBe('https://one');
    expect(await b).toBe('https://one');
  });

  it('a network error resolves to the empty fallback instead of throwing', async () => {
    const { resolveSignedAssetUrl, resolveSignedPreviewUrlsBatch } = await loadUtils();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(resolveSignedPreviewUrlsBatch([thumb(1)], 'tok')).resolves.toEqual({});
    await expect(resolveSignedAssetUrl(thumb(1), 'tok')).resolves.toBe('');
  });
});
