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

export function ensureTokenUrl(path: string | null | undefined, accessToken: string | null): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  
  // Create cache key from path and token
  const cacheKey = `${path}:${accessToken || 'no-token'}`;
  
  // Check cache first
  const cached = getCachedUrl(cacheKey);
  if (cached) return cached;
  
  // Generate URL
  const url = path.startsWith('/') ? path : `/${path}`;
  const finalUrl = !accessToken 
    ? url 
    : `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(accessToken)}`;
  
  // Cache the URL
  setCachedUrl(cacheKey, finalUrl);
  
  return finalUrl;
}

export function buildAuthHeaders(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
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
  
  // For images/files, show file extension
  if (asset.current_version?.mime_type) {
    const ext = asset.current_version.mime_type.split('/')[1];
    return ext?.toUpperCase() || 'File';
  }
  
  return asset.asset_type.toUpperCase();
}

