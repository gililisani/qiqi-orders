import { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import pdfParse from 'pdf-parse';
import { logger } from '../logger';
import { createStorage } from '../../../platform/storage';

interface ProcessVersionPayload {
  assetId: string;
  versionId: string;
}

interface AssetVersionRecord {
  id: string;
  asset_id: string;
  storage_path: string;
  storage_bucket: string;
  thumbnail_path: string | null;
  mime_type: string | null;
  metadata: Record<string, unknown> | null;
  processing_status: string;
}

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 400;
const THUMBNAIL_QUALITY = 85;

async function generateImageThumbnail(
  imageBuffer: Buffer,
  outputPath: string,
  storage: any,
): Promise<{ width: number; height: number; thumbnailPath: string }> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const thumbnail = await sharp(imageBuffer)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toBuffer();

  const thumbnailBytes = new Uint8Array(thumbnail);
  await storage.putObject(outputPath, thumbnailBytes, {
    contentType: 'image/jpeg',
  });

  return { width, height, thumbnailPath: outputPath };
}

async function extractPDFText(pdfBuffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const data = await pdfParse(pdfBuffer);
  return {
    text: data.text || '',
    pageCount: data.numpages || 0,
  };
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
    mimeType: version.mime_type,
  });

  const storage = createStorage();
  let fileBytes: Uint8Array;
  try {
    fileBytes = await storage.getObject(version.storage_path);
  } catch (err) {
    throw new Error(`Failed to download file from storage: ${err instanceof Error ? err.message : String(err)}`);
  }

  const fileBuffer = Buffer.from(fileBytes);
  const mimeType = version.mime_type || 'application/octet-stream';
  const updateData: Record<string, unknown> = {};

  // Process images
  if (mimeType.startsWith('image/')) {
    try {
      const thumbnailPath = `${payload.assetId}/thumbnails/${payload.versionId}.jpg`;
      const { width, height, thumbnailPath: generatedThumbnailPath } = await generateImageThumbnail(
        fileBuffer,
        thumbnailPath,
        storage,
      );

      updateData.width = width;
      updateData.height = height;
      updateData.thumbnail_path = generatedThumbnailPath;

      logger.info('Generated thumbnail for image', {
        versionId: payload.versionId,
        width,
        height,
        thumbnailPath: generatedThumbnailPath,
      });
    } catch (err) {
      logger.error('Failed to generate thumbnail', {
        versionId: payload.versionId,
        error: err instanceof Error ? err.message : String(err),
      });
      metadata.thumbnailError = err instanceof Error ? err.message : String(err);
      // Continue processing even if thumbnail generation fails
    }
  }

  // Process PDFs
  else if (mimeType === 'application/pdf') {
    try {
      const { text, pageCount } = await extractPDFText(fileBuffer);
      updateData.extracted_text = text;
      updateData.page_count = pageCount;

      logger.info('Extracted text from PDF', {
        versionId: payload.versionId,
        pageCount,
        textLength: text.length,
      });

      // Generate PDF thumbnail (first page)
      // For PDF thumbnails, we'd need pdf-poppler or similar
      // For now, we'll skip PDF thumbnails as it requires additional dependencies
      logger.debug('PDF thumbnail generation skipped (requires additional dependencies)');
    } catch (err) {
      logger.error('Failed to extract PDF text', {
        versionId: payload.versionId,
        error: err instanceof Error ? err.message : String(err),
      });
      metadata.pdfExtractionError = err instanceof Error ? err.message : String(err);
      // Continue processing even if PDF extraction fails
    }
  }

  // Other file types
  else {
    logger.info('File type does not require processing', {
      versionId: payload.versionId,
      mimeType,
    });
    metadata.processingNote = `File type ${mimeType} does not require processing`;
  }

  metadata.processingCompletedAt = new Date().toISOString();
  updateData.processing_status = 'complete';
  updateData.metadata = metadata;

  const { error: completeError } = await supabase
    .from('dam_asset_versions')
    .update(updateData)
    .eq('id', payload.versionId);

  if (completeError) throw completeError;

  logger.info('Asset version processing completed', {
    versionId: payload.versionId,
    updates: Object.keys(updateData),
  });
}
