import type { ObjectStorage } from './index';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`S3 storage driver requires ${key}`);
  }
  return value;
}

function streamToBuffer(stream: Readable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve(Uint8Array.from(Buffer.concat(chunks))));
    stream.on('error', reject);
  });
}

export function createS3Storage(): ObjectStorage {
  const region = requiredEnv('S3_REGION');
  const bucket = requiredEnv('S3_BUCKET');
  const accessKeyId = requiredEnv('S3_ACCESS_KEY_ID');
  const secretAccessKey = requiredEnv('S3_SECRET_ACCESS_KEY');
  const endpoint = process.env.S3_ENDPOINT;
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

  const client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    endpoint,
    forcePathStyle,
  });

  return {
    async putObject(path, bytes, meta) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: path,
        Body: bytes,
        Metadata: meta,
        ContentType: meta?.contentType,
      });

      const response = await client.send(command);
      return { etag: response.ETag ?? null, path };
    },

    async getObject(path) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: path });
      const response = await client.send(command);
      if (!response.Body) {
        throw new Error(`Object ${path} has no body`);
      }

      if (response.Body instanceof Readable) {
        return await streamToBuffer(response.Body);
      }

      const body: any = response.Body;
      if (typeof body?.transformToByteArray === 'function') {
        const bytes = await body.transformToByteArray();
        return Uint8Array.from(bytes);
      }

      if (typeof body?.arrayBuffer === 'function') {
        const buffer = await body.arrayBuffer();
        return new Uint8Array(buffer);
      }

      throw new Error('Unsupported S3 body type');
    },

    async getSignedUrl(path, opts) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: path,
        ResponseContentDisposition: opts.downloadName ? `attachment; filename="${opts.downloadName}"` : undefined,
      });
      return awsGetSignedUrl(client, command, { expiresIn: opts.expiresIn });
    },

    async deleteObject(path) {
      const command = new DeleteObjectCommand({ Bucket: bucket, Key: path });
      await client.send(command);
    },

    async list(prefix) {
      const results: Array<{ path: string; bytes: number }> = [];
      let continuationToken: string | undefined;

      do {
        const command = new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix || undefined,
          ContinuationToken: continuationToken,
        });
        const response = await client.send(command);
        for (const item of response.Contents ?? []) {
          if (!item.Key) continue;
          results.push({ path: item.Key, bytes: Number(item.Size ?? 0) });
        }
        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return results;
    },
  };
}
