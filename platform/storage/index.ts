import { createSupabaseStorage } from './supabase';
import { createS3Storage } from './s3';

export interface ObjectStorage {
  putObject(path: string, bytes: Uint8Array, meta?: Record<string, string>): Promise<{ etag: string | null; path: string }>;
  getObject(path: string): Promise<Uint8Array>;
  getSignedUrl(path: string, opts: { expiresIn: number; downloadName?: string }): Promise<string>;
  /**
   * Sign many objects in one go (thumbnail grids). Returns path → URL; a path
   * that could not be signed (missing object) is simply absent. Prefer this
   * over looping getSignedUrl: on Supabase every sign is a Storage → Postgres
   * round trip, and a page of parallel signs exhausted Storage's connection
   * pool in production ("Too many connections issued to the database").
   */
  getSignedUrls(paths: string[], opts: { expiresIn: number }): Promise<Record<string, string>>;
  deleteObject(path: string): Promise<void>;
  list(prefix: string): Promise<Array<{ path: string; bytes: number }>>;
}

export function createStorage(): ObjectStorage {
  const driver = process.env.STORAGE_DRIVER?.toLowerCase() ?? 'supabase';
  if (driver === 's3') {
    return createS3Storage();
  }
  return createSupabaseStorage();
}

export { createSupabaseStorage, createS3Storage };
