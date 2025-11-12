#!/usr/bin/env tsx
import 'dotenv/config';
import { createSupabaseStorage, createS3Storage, ObjectStorage } from '../platform/storage';

function resolveStorage(driver: string): ObjectStorage {
  switch (driver) {
    case 's3':
      return createS3Storage();
    case 'supabase':
      return createSupabaseStorage();
    default:
      throw new Error(`Unsupported storage driver: ${driver}`);
  }
}

async function main() {
  const sourceDriver = (process.env.EXPORT_SOURCE_DRIVER ?? process.env.STORAGE_DRIVER ?? 'supabase').toLowerCase();
  const targetDriver = process.env.EXPORT_TARGET_DRIVER?.toLowerCase();

  console.log(`[export-storage] Source driver: ${sourceDriver}`);
  if (targetDriver) {
    console.log(`[export-storage] Target driver: ${targetDriver}`);
  }

  const source = resolveStorage(sourceDriver);
  const target = targetDriver ? resolveStorage(targetDriver) : null;

  const objects = await source.list('');
  let totalBytes = 0;
  let mirrored = 0;

  if (objects.length === 0) {
    console.log('[export-storage] No objects found.');
    return;
  }

  for (const object of objects) {
    totalBytes += object.bytes;
    if (!target) continue;

    const bytes = await source.getObject(object.path);
    await target.putObject(object.path, bytes);
    mirrored += 1;
    if (mirrored % 10 === 0) {
      console.log(`[export-storage] Mirrored ${mirrored}/${objects.length} objects...`);
    }
  }

  console.log('[export-storage] Completed');
  console.log(`  Objects scanned: ${objects.length}`);
  console.log(`  Bytes scanned : ${totalBytes}`);
  if (target) {
    console.log(`  Objects copied: ${mirrored}`);
  }
}

main().catch((error) => {
  console.error('[export-storage] Failed', error);
  process.exit(1);
});
