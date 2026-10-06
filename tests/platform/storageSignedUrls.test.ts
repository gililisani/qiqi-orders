import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSignedUrls = vi.fn();
const createSignedUrl = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from: () => ({ createSignedUrls, createSignedUrl }) },
  }),
}));

import { createSupabaseStorage } from '@/platform/storage/supabase';

describe('supabase storage getSignedUrls', () => {
  beforeEach(() => {
    createSignedUrls.mockReset();
    createSignedUrl.mockReset();
    createSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((p) =>
        p.startsWith('missing')
          ? { path: p, signedUrl: null, signedURL: null, error: 'Either the object does not exist' }
          : { path: p, signedUrl: `https://signed/${p}`, signedURL: `/signed/${p}`, error: null }
      ),
      error: null,
    }));
  });

  it('signs a whole page in one storage call, never per object', async () => {
    const urls = await createSupabaseStorage().getSignedUrls(['a.png', 'b.png', 'a.png'], { expiresIn: 300 });
    expect(urls).toEqual({ 'a.png': 'https://signed/a.png', 'b.png': 'https://signed/b.png' });
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(['a.png', 'b.png'], 300);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('leaves out objects that could not be signed', async () => {
    const urls = await createSupabaseStorage().getSignedUrls(['a.png', 'missing.png'], { expiresIn: 300 });
    expect(urls).toEqual({ 'a.png': 'https://signed/a.png' });
  });

  it('chunks very large requests at 100 objects', async () => {
    const paths = Array.from({ length: 150 }, (_, i) => `p${i}.png`);
    const urls = await createSupabaseStorage().getSignedUrls(paths, { expiresIn: 300 });
    expect(Object.keys(urls)).toHaveLength(150);
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    expect(createSignedUrls.mock.calls[0][0]).toHaveLength(100);
    expect(createSignedUrls.mock.calls[1][0]).toHaveLength(50);
  });

  it('throws when storage refuses the request', async () => {
    createSignedUrls.mockResolvedValueOnce({
      data: null,
      error: new Error('Too many connections issued to the database'),
    });
    await expect(createSupabaseStorage().getSignedUrls(['a.png'], { expiresIn: 300 })).rejects.toThrow(
      'Too many connections'
    );
  });
});
