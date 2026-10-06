// Shared utility functions for DAM components

// URL cache for signed URLs (5 minute TTL)
const URL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const urlCache = new Map<string, { url: string; timestamp: number }>();

function getCachedUrl(key: string): string | null {
  const cached = urlCache.get(key);
  if (!cached) return null;
  
  // Check if cache is still valid
  if (Date.now() - cached.timestamp > URL_CACHE_TTL) {
    urlCache.delete(key);
    return null;
  }
  
  return cached.url;
}

function setCachedUrl(key: string, url: string): void {
  urlCache.set(key, { url, timestamp: Date.now() });
  
  // Clean up old entries periodically (keep cache size reasonable)
  if (urlCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of urlCache.entries()) {
      if (now - v.timestamp > URL_CACHE_TTL) {
        urlCache.delete(k);
      }
    }
  }
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 || value < 1 ? 0 : 1)} ${units[exponent]}`;
}

/**
 * Builds a same-origin URL for `/api/assets/...` preview/download routes.
 * Auth uses the Supabase session cookie (refreshed via middleware); we intentionally
 * do not append JWTs as `?token=` query parameters (referrer / log leakage).
 *
 * @param _accessToken Kept for call-site compatibility; not embedded in the returned URL.
 */
export function ensureTokenUrl(path: string | null | undefined, _accessToken: string | null): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;

  const url = path.startsWith('/') ? path : `/${path}`;
  const cacheKey = url;

  const cached = getCachedUrl(cacheKey);
  if (cached) return cached;

  setCachedUrl(cacheKey, url);
  return url;
}

export function buildAuthHeaders(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// Signed-URL lookups in flight, by cache key. Concurrent callers for the same
// key share one request, and a card whose thumbnail is in a running page batch
// waits for that batch instead of racing it with its own request.
type InflightSign = { promise: Promise<string>; fromBatch: boolean };
const inflightSigns = new Map<string, InflightSign>();

// Per-card sign requests are throttled. Every sign is a Supabase Storage →
// Postgres round trip; a page of cards signing in parallel exhausted Storage's
// connection pool in production ("Too many connections issued to the database").
const MAX_PARALLEL_SIGNS = 4;
let activeSigns = 0;
const signQueue: Array<() => void> = [];

async function withSignSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeSigns < MAX_PARALLEL_SIGNS) {
    activeSigns++;
  } else {
    // The releasing caller hands its slot straight to us (no re-count).
    await new Promise<void>((resolve) => signQueue.push(resolve));
  }
  try {
    return await fn();
  } finally {
    const next = signQueue.shift();
    if (next) next();
    else activeSigns--;
  }
}

function signedUrlRequest(apiPath: string): { url: string; cacheKey: string } {
  const rawUrl = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const url = rawUrl.includes('?') ? `${rawUrl}&format=json` : `${rawUrl}?format=json`;
  return { url, cacheKey: `signed:${url}` };
}

function fetchSignedUrl(url: string, cacheKey: string, accessToken: string): Promise<string> {
  const existing = inflightSigns.get(cacheKey);
  if (existing && !existing.fromBatch) return existing.promise;

  const promise = withSignSlot(async () => {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...buildAuthHeaders(accessToken),
        Accept: 'application/json',
      },
      credentials: 'same-origin',
    });

    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      const signed = typeof data?.url === 'string' ? data.url : '';
      if (signed) {
        setCachedUrl(cacheKey, signed);
        return signed;
      }
    }

    // If server returned JSON error, don't cache; return empty string so callers can show fallback.
    return '';
  })
    .catch(() => '')
    .finally(() => {
      if (inflightSigns.get(cacheKey)?.promise === promise) inflightSigns.delete(cacheKey);
    });

  inflightSigns.set(cacheKey, { promise, fromBatch: false });
  return promise;
}

/**
 * Resolve a protected `/api/assets/...` URL into a short-lived signed URL by
 * following the server-side 302 redirect with an Authorization header.
 *
 * This is required for <img src> and direct downloads because browsers do not
 * attach Bearer headers on normal navigations.
 */
export async function resolveSignedAssetUrl(
  apiPath: string | null | undefined,
  accessToken: string | null
): Promise<string> {
  if (!apiPath) return '';
  if (apiPath.startsWith('http')) return apiPath;
  if (!accessToken) return '';

  const { url, cacheKey } = signedUrlRequest(apiPath);
  const cached = getCachedUrl(cacheKey);
  if (cached) return cached;

  const pending = inflightSigns.get(cacheKey);
  if (pending?.fromBatch) {
    const signed = await pending.promise;
    if (signed) return signed;
    // The batch failed or skipped this path: fall back to a single request.
  }

  return fetchSignedUrl(url, cacheKey, accessToken);
}

/**
 * Batch-resolve a list of protected preview API paths into signed URLs.
 * This reduces per-card request waterfalls; results are also primed into the same cache
 * used by `resolveSignedAssetUrl` so existing card code can benefit without refactors.
 * Paths are registered as in flight before the request starts, so cards that
 * render meanwhile wait for this batch instead of signing one by one.
 */
export async function resolveSignedPreviewUrlsBatch(
  apiPaths: Array<string | null | undefined>,
  accessToken: string | null
): Promise<Record<string, string>> {
  if (!accessToken) return {};

  const rawPaths = apiPaths
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map((p) => (p.startsWith('/') ? p : `/${p}`))
    .filter((p) => !p.startsWith('http'));

  // Must stay synchronous up to the fetch: callers fire this right after
  // setAssets(), and cards mounting from that render have to find these
  // entries already registered.
  const waiting = new Map<string, (signed: string) => void>();
  for (const path of Array.from(new Set(rawPaths)).slice(0, 100)) {
    const { cacheKey } = signedUrlRequest(path);
    if (getCachedUrl(cacheKey) || inflightSigns.has(cacheKey)) continue;
    let settle!: (signed: string) => void;
    const promise = new Promise<string>((resolve) => {
      settle = resolve;
    });
    inflightSigns.set(cacheKey, { promise, fromBatch: true });
    waiting.set(path, settle);
  }
  if (waiting.size === 0) return {};

  let urls: Record<string, string> = {};
  try {
    const res = await fetch('/api/assets/preview/resolve-batch', {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(accessToken),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ paths: Array.from(waiting.keys()) }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { urls?: Record<string, string> } | null;
      urls = data?.urls && typeof data.urls === 'object' ? data.urls : {};
    }
  } catch {
    // Best-effort: waiting cards fall back to throttled single requests.
  } finally {
    // Prime the cache and release waiters. Entries are removed before
    // settling so a waiter whose path failed starts a fresh single request.
    for (const [path, settle] of waiting) {
      const { cacheKey } = signedUrlRequest(path);
      const signed = typeof urls[path] === 'string' ? urls[path] : '';
      if (signed) setCachedUrl(cacheKey, signed);
      inflightSigns.delete(cacheKey);
      settle(signed);
    }
  }

  return urls;
}

// Get static thumbnail path for Word/Excel documents
export function getStaticDocumentThumbnail(mimeType: string | null | undefined): string | null {
  if (!mimeType) return null;
  
  const mime = mimeType.toLowerCase();
  
  // Word documents
  if (mime.includes('word') || mime.includes('msword') || mime.includes('wordprocessingml')) {
    return '/dam-icons/microsoft-word.svg';
  }
  
  // Excel documents
  if (mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('spreadsheetml') || mime === 'text/csv') {
    return '/dam-icons/microsoft-excel.svg';
  }
  
  return null;
}

// Get friendly file type name from MIME type
export function getFriendlyFileType(mimeType: string | null | undefined): string {
  if (!mimeType) return 'File';
  
  const mimeToFriendly: Record<string, string> = {
    // Images
    'image/jpeg': 'JPEG',
    'image/jpg': 'JPEG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
    'image/webp': 'WebP',
    'image/svg+xml': 'SVG',
    // Documents
    'application/pdf': 'PDF',
    'application/msword': 'Word Document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
    'application/vnd.ms-excel': 'Excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'text/csv': 'CSV',
    'application/vnd.ms-powerpoint': 'PowerPoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
    // Audio
    'audio/mpeg': 'MP3',
    'audio/wav': 'WAV',
    'audio/mp4': 'AAC',
    // Video
    'video/mp4': 'MP4',
    'video/quicktime': 'MOV',
    // Archives
    'application/zip': 'ZIP',
    'application/x-rar-compressed': 'RAR',
    // Fonts
    'font/ttf': 'TTF',
    'font/otf': 'OTF',
    'application/font-woff': 'WOFF',
    'application/font-woff2': 'WOFF2',
  };
  
  return mimeToFriendly[mimeType.toLowerCase()] || mimeType.split('/')[1]?.toUpperCase() || 'File';
}

export function getFileTypeBadge(asset: {
  asset_type: string;
  vimeo_video_id?: string | null;
  vimeo_download_formats?: Array<{ resolution: string; url: string }> | null;
  vimeo_download_1080p?: string | null;
  vimeo_download_720p?: string | null;
  vimeo_download_480p?: string | null;
  vimeo_download_360p?: string | null;
  current_version?: { mime_type?: string | null } | null;
}): string {
  if (asset.asset_type === 'video' && asset.vimeo_video_id) {
    // For videos, show highest resolution
    const formats = asset.vimeo_download_formats && asset.vimeo_download_formats.length > 0
      ? asset.vimeo_download_formats
      : [
          ...(asset.vimeo_download_1080p ? [{ resolution: '1080p' }] : []),
          ...(asset.vimeo_download_720p ? [{ resolution: '720p' }] : []),
          ...(asset.vimeo_download_480p ? [{ resolution: '480p' }] : []),
          ...(asset.vimeo_download_360p ? [{ resolution: '360p' }] : []),
        ];
    
    if (formats.length > 0) {
      // Sort by resolution priority (highest first)
      const resolutionOrder: Record<string, number> = {
        '4K': 1, '2K': 2, '1080p': 3, '720p': 4, '540p': 5, '480p': 6, '360p': 7, '240p': 8
      };
      formats.sort((a, b) => {
        const aOrder = resolutionOrder[a.resolution] || 999;
        const bOrder = resolutionOrder[b.resolution] || 999;
        return aOrder - bOrder;
      });
      return formats[0].resolution;
    }
    return 'Video';
  }
  
  // For images/files, show friendly file type name
  if (asset.current_version?.mime_type) {
    return getFriendlyFileType(asset.current_version.mime_type);
  }
  
  return asset.asset_type.toUpperCase();
}

