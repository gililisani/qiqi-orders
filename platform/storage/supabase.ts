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
  const url = getEnv('SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('Supabase storage driver requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
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

      return { etag: data?.etag ?? null };
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
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        recursive: true,
      });

      if (error) {
        throw error;
      }

      return (data ?? []).map((obj) => ({
        path: obj.name,
        bytes: obj.metadata?.size ?? 0,
      }));
    },
  };
}
