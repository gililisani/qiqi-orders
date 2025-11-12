import { createClient } from '@supabase/supabase-js';
import type { ObjectStorage } from './index';

declare const Deno: { env: { get(key: string): string | undefined } } | undefined;

function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[key];
    if (value !== undefined) return value;
  }
  if (typeof Deno !== 'undefined' && typeof Deno.env !== 'undefined') {
    try {
      return Deno.env.get(key) ?? undefined;
    } catch (error) {
      // ignore if not accessible
    }
  }
  return undefined;
}

function getSupabaseServiceClient() {
  const url = getEnv('SUPABASE_URL') ?? getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('Supabase storage driver requires SUPABASE_SERVICE_ROLE_KEY and either SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createSupabaseStorage(): ObjectStorage {
  const supabase = getSupabaseServiceClient();
  const bucket = getEnv('SUPABASE_STORAGE_BUCKET') ?? 'dam-assets';

  const listRecursive = async (prefix: string, acc: Array<{ path: string; bytes: number }>) => {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 1000,
    });

    if (error) {
      throw error;
    }

    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.metadata && typeof item.metadata.size === 'number') {
        acc.push({ path, bytes: item.metadata.size });
      } else {
        await listRecursive(path, acc);
      }
    }
  };

  return {
    async putObject(path, bytes, meta) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, bytes, {
          cacheControl: '3600',
          upsert: true,
          contentType: meta?.contentType,
          metadata: meta,
        });

      if (error) {
        throw error;
      }

      return { etag: null, path: data?.path ?? path };
    },

    async getObject(path) {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) {
        throw error;
      }
      const arrayBuffer = await data.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    },

    async getSignedUrl(path, opts) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, opts.expiresIn, {
          download: opts.downloadName,
        });

      if (error || !data?.signedUrl) {
        throw error ?? new Error('Failed to generate signed URL');
      }

      return data.signedUrl;
    },

    async deleteObject(path) {
      const { error } = await supabase.storage.from(bucket).remove([path]);
      if (error) {
        throw error;
      }
    },

    async list(prefix) {
      const results: Array<{ path: string; bytes: number }> = [];
      await listRecursive(prefix, results);
      return results;
    },
  };
}
