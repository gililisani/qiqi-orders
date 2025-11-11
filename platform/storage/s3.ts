import type { ObjectStorage } from './index';

export function createS3Storage(): ObjectStorage {
  throw new Error('S3 storage driver not yet implemented. Set STORAGE_DRIVER=supabase.');
}
