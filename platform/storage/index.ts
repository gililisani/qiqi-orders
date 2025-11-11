import { createSupabaseStorage } from './supabase';
import { createS3Storage } from './s3';

export interface ObjectStorage {
  putObject(path: string, bytes: Uint8Array, meta?: Record<string, string>): Promise<{ etag: string | null }>;
  getSignedUrl(path: string, opts: { expiresIn: number; downloadName?: string }): Promise<string>;
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
