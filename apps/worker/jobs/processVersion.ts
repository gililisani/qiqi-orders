import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger';

interface ProcessVersionPayload {
  assetId: string;
  versionId: string;
}

interface AssetVersionRecord {
  id: string;
  asset_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  metadata: Record<string, unknown> | null;
  processing_status: string;
}

export async function processVersionJob(
  supabase: SupabaseClient,
  payload: ProcessVersionPayload,
  workerId: string,
): Promise<void> {
  if (!payload?.assetId || !payload?.versionId) {
    throw new Error('Missing assetId or versionId in job payload');
  }

  const { data: version, error: fetchError } = await supabase
    .from('dam_asset_versions')
    .select('*')
    .eq('id', payload.versionId)
    .maybeSingle<AssetVersionRecord>();

  if (fetchError) throw fetchError;
  if (!version) throw new Error(`Asset version ${payload.versionId} not found`);

  const metadata = {
    ...(version.metadata ?? {}),
    workerId,
    processingStartedAt: new Date().toISOString(),
  } as Record<string, unknown>;

  const { error: startError } = await supabase
    .from('dam_asset_versions')
    .update({
      processing_status: 'processing',
      metadata,
    })
    .eq('id', payload.versionId);

  if (startError) throw startError;

  logger.info('Processing asset version', {
    assetId: payload.assetId,
    versionId: payload.versionId,
    storagePath: version.storage_path,
  });

  // TODO: Implement actual thumbnail generation and PDF text extraction.

  metadata.processingCompletedAt = new Date().toISOString();
  metadata.processingNotes = 'Processing completed by DAM worker (placeholder).';

  const { error: completeError } = await supabase
    .from('dam_asset_versions')
    .update({
      processing_status: 'complete',
      metadata,
    })
    .eq('id', payload.versionId);

  if (completeError) throw completeError;
}
