'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSupabase } from '../../../lib/supabase-provider';
import Card from '../../components/ui/Card';
import {
  ArrowPathIcon,
  DocumentTextIcon,
  FilmIcon,
  MusicalNoteIcon,
  PhotoIcon,
  Squares2X2Icon,
  ArrowDownTrayIcon,
  XMarkIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline';

const assetTypeOptions: Array<{ value: string; label: string; icon: JSX.Element }> = [
  { value: 'image', label: 'Image', icon: <PhotoIcon className="h-4 w-4" /> },
  { value: 'video', label: 'Video', icon: <FilmIcon className="h-4 w-4" /> },
  { value: 'document', label: 'Document', icon: <DocumentTextIcon className="h-4 w-4" /> },
  { value: 'audio', label: 'Audio', icon: <MusicalNoteIcon className="h-4 w-4" /> },
  { value: 'archive', label: 'Archive', icon: <Squares2X2Icon className="h-4 w-4" /> },
  { value: 'other', label: 'Other', icon: <Squares2X2Icon className="h-4 w-4" /> },
];

interface LocaleOption {
  code: string;
  label: string;
  is_default?: boolean;
}

interface RegionOption {
  code: string;
  label: string;
}

interface AssetVersion {
  id: string;
  version_number: number;
  storage_path: string;
  thumbnail_path?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  processing_status: string;
  created_at: string;
  duration_seconds?: number | null;
  width?: number | null;
  height?: number | null;
  downloadPath?: string | null;
  previewPath?: string | null;
}

interface AssetRecord {
  id: string;
  title: string;
  description?: string | null;
  asset_type: string;
  product_line?: string | null;
  sku?: string | null;
  vimeo_video_id?: string | null;
  vimeo_download_1080p?: string | null;
  vimeo_download_720p?: string | null;
  vimeo_download_480p?: string | null;
  vimeo_download_360p?: string | null;
  created_at: string;
  current_version?: AssetVersion | null;
  tags: string[];
  audiences: string[];
  locales: LocaleOption[];
  regions: RegionOption[];
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

function buildAuthHeaders(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function ensureTokenUrl(path: string | null | undefined, accessToken: string | null): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const url = path.startsWith('/') ? path : `/${path}`;
  if (!accessToken) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(accessToken)}`;
}

async function logDownload(
  assetId: string,
  downloadUrl: string,
  downloadMethod: string,
  accessToken: string | null
): Promise<void> {
  if (!accessToken) return;
  
  try {
    const headers = buildAuthHeaders(accessToken);
    await fetch('/api/dam/downloads/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        assetId,
        downloadUrl,
        downloadMethod,
      }),
    });
  } catch (err) {
    console.error('Failed to log download:', err);
  }
}

async function triggerDownload(
  url: string,
  filename: string,
  assetId: string,
  downloadMethod: string,
  accessToken: string | null
): Promise<void> {
  try {
    await logDownload(assetId, url, downloadMethod, accessToken);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        return;
      }
    } catch (fetchError) {
      console.log('Direct fetch failed, using fallback method');
    }
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'download';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Download failed:', err);
    window.open(url, '_blank');
  }
}

export default function ClientAssetsPage() {
  const { session, supabase } = useSupabase();
  const [accessToken, setAccessToken] = useState<string | null>(session?.access_token ?? null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [error, setError] = useState<string>('');

  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [productLines, setProductLines] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [localeFilter, setLocaleFilter] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [productLineFilter, setProductLineFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pagination, setPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);

  useEffect(() => {
    let active = true;
    if (!accessToken) {
      supabase.auth.getSession().then(({ data }: { data: { session: { access_token: string } | null } }) => {
        if (!active) return;
        setAccessToken(data.session?.access_token ?? null);
      });
    }
    return () => {
      active = false;
    };
  }, [accessToken, supabase]);

  const fetchLookups = useCallback(async (token: string) => {
    try {
      const headers = buildAuthHeaders(token);
      const response = await fetch('/api/dam/lookups', {
        headers: Object.keys(headers).length ? headers : undefined,
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Failed to load lookups');
      const data = await response.json() as { locales?: LocaleOption[]; regions?: RegionOption[]; tags?: Array<{ label: string }> };
      setLocales(data.locales || []);
      setRegions(data.regions || []);
      setTags([...new Set((data.tags || []).map((t) => t.label))]);
    } catch (err: any) {
      console.error('Failed to load lookups', err);
    }
  }, []);

  const fetchAssets = async (token: string, search?: string, page: number = 1) => {
    try {
      setLoadingAssets(true);
      setError('');

      const headers = buildAuthHeaders(token);
      const params = new URLSearchParams();
      if (search) params.append('q', search);
      if (typeFilter) params.append('type', typeFilter);
      if (productLineFilter) params.append('productLine', productLineFilter);
      if (localeFilter) params.append('locale', localeFilter);
      if (regionFilter) params.append('region', regionFilter);
      if (tagFilter) params.append('tag', tagFilter);
      params.append('page', page.toString());
      params.append('limit', '50');

      const url = `/api/dam/assets/client?${params.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: Object.keys(headers).length ? headers : undefined,
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load assets');
      }

      const payload = await response.json() as { assets?: AssetRecord[]; pagination?: any };
      setAssets(payload.assets || []);
      setPagination(payload.pagination || null);
      setCurrentPage(page);
      
      // Extract unique product lines
      const uniqueProductLines = [...new Set((payload.assets || []).map((a) => a.product_line).filter((pl): pl is string => Boolean(pl)))];
      setProductLines(uniqueProductLines);
    } catch (err: any) {
      console.error('Failed to load assets', err);
      setError(err.message || 'Failed to load assets');
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    fetchLookups(accessToken);
    const timeoutId = setTimeout(() => {
      fetchAssets(accessToken, searchTerm || undefined, 1);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [accessToken, searchTerm, typeFilter, localeFilter, regionFilter, tagFilter, productLineFilter, fetchLookups]);

  const filteredAssets = useMemo(() => {
    return assets; // Assets are already filtered by the API
  }, [assets]);

  const renderAssetTypePill = (type: string) => {
    const option = assetTypeOptions.find((opt) => opt.value === type);
    if (!option) return null;
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
        {option.icon}
        {option.label}
      </span>
    );
  };

  if (error && !loadingAssets) {
    return (
      <div className="mt-8 mb-4 space-y-6">
        <Card>
          <div className="p-6 text-center text-red-600">
            <p>Error loading assets: {error}</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Asset Library</h1>
        <p className="mt-1 text-sm text-gray-600">Browse and download available assets.</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="p-4">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row">
              <input
                type="search"
                placeholder="Search by title, product line, or SKU"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              />
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              >
                <option value="">All types</option>
                {assetTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={productLineFilter}
                onChange={(event) => setProductLineFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              >
                <option value="">All product lines</option>
                {productLines.map((pl) => (
                  <option key={pl} value={pl}>
                    {pl}
                  </option>
                ))}
              </select>
              <select
                value={localeFilter}
                onChange={(event) => setLocaleFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              >
                <option value="">All locales</option>
                {locales.map((locale) => (
                  <option key={locale.code} value={locale.code}>
                    {locale.label}
                  </option>
                ))}
              </select>
              <select
                value={regionFilter}
                onChange={(event) => setRegionFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              >
                <option value="">All regions</option>
                {regions.map((region) => (
                  <option key={region.code} value={region.code}>
                    {region.label}
                  </option>
                ))}
              </select>
              <select
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              >
                <option value="">All tags</option>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`rounded-lg p-2 transition ${
                  viewMode === 'grid' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Grid view"
              >
                <Squares2X2Icon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`rounded-lg p-2 transition ${
                  viewMode === 'list' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="List view"
              >
                <Bars3Icon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Asset Library */}
      <Card>
        {loadingAssets ? (
          <div className="flex items-center justify-center py-12 text-gray-600">
            <div className="flex items-center gap-3 text-sm">
              <ArrowPathIcon className="h-5 w-5 animate-spin" />
              Loading assets…
            </div>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-600">
            No assets found. Try adjusting your filters.
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAssets.map((asset) => (
              <div
                key={asset.id}
                className="flex flex-col gap-4 rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-gray-300 transition"
                onClick={() => setSelectedAsset(asset)}
              >
                <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                  {asset.asset_type === 'video' && asset.vimeo_video_id ? (
                    <img
                      src={`https://vumbnail.com/${asset.vimeo_video_id}.jpg`}
                      alt={asset.title}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://i.vimeocdn.com/video/${asset.vimeo_video_id}_640.jpg`;
                      }}
                    />
                  ) : accessToken && asset.current_version?.previewPath ? (
                    <img
                      src={ensureTokenUrl(asset.current_version.previewPath, accessToken)}
                      alt={asset.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-400">
                      <PhotoIcon className="h-12 w-12" />
                    </div>
                  )}
                  {asset.current_version && (
                    <span className="absolute bottom-2 right-2 rounded bg-white/90 px-2 py-1 text-[10px] font-medium text-gray-700">
                      v{asset.current_version.version_number}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-gray-900">{asset.title}</h4>
                    {renderAssetTypePill(asset.asset_type)}
                  </div>
                  {asset.description && (
                    <p className="text-xs text-gray-600 line-clamp-2">{asset.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    {asset.sku && <span>SKU {asset.sku}</span>}
                    {asset.product_line && <span>{asset.product_line}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredAssets.map((asset) => (
              <div
                key={asset.id}
                className="flex gap-4 p-4 cursor-pointer hover:bg-gray-50 transition"
                onClick={() => setSelectedAsset(asset)}
              >
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                  {asset.asset_type === 'video' && asset.vimeo_video_id ? (
                    <img
                      src={`https://vumbnail.com/${asset.vimeo_video_id}.jpg`}
                      alt={asset.title}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://i.vimeocdn.com/video/${asset.vimeo_video_id}_640.jpg`;
                      }}
                    />
                  ) : accessToken && asset.current_version?.previewPath ? (
                    <img
                      src={ensureTokenUrl(asset.current_version.previewPath, accessToken)}
                      alt={asset.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-400">
                      <PhotoIcon className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-gray-900">{asset.title}</h4>
                        {renderAssetTypePill(asset.asset_type)}
                      </div>
                    </div>
                    {asset.description && (
                      <p className="text-xs text-gray-600 line-clamp-1">{asset.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>Created {new Date(asset.created_at).toLocaleDateString()}</span>
                      {asset.sku && <span>SKU {asset.sku}</span>}
                      {asset.product_line && <span>{asset.product_line}</span>}
                      {asset.current_version && (
                        <span>Size: {formatBytes(asset.current_version.file_size) || '—'}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Pagination Controls */}
        {pagination && pagination.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
            <div className="text-sm text-gray-700">
              Showing <span className="font-medium">{(pagination.page - 1) * pagination.limit + 1}</span> to{' '}
              <span className="font-medium">
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </span>{' '}
              of <span className="font-medium">{pagination.total}</span> assets
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const newPage = currentPage - 1;
                  setCurrentPage(newPage);
                  fetchAssets(accessToken ?? '', searchTerm || undefined, newPage);
                }}
                disabled={!pagination.hasPreviousPage}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => {
                  const newPage = currentPage + 1;
                  setCurrentPage(newPage);
                  fetchAssets(accessToken ?? '', searchTerm || undefined, newPage);
                }}
                disabled={!pagination.hasNextPage}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Asset Detail Modal */}
      {selectedAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedAsset(null);
            }
          }}
        >
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-xl">
            <button
              type="button"
              onClick={() => setSelectedAsset(null)}
              className="absolute top-4 right-4 z-10 rounded-full bg-white/90 p-2 text-gray-600 hover:bg-white hover:text-gray-900 transition"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>

            <div className="p-6">
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-gray-900">{selectedAsset.title}</h2>
                  {renderAssetTypePill(selectedAsset.asset_type)}
                </div>
                {selectedAsset.description && (
                  <p className="text-gray-600">{selectedAsset.description}</p>
                )}
              </div>

              {/* Preview */}
              <div className="mb-6">
                {selectedAsset.asset_type === 'video' && selectedAsset.vimeo_video_id ? (
                  <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                    <iframe
                      src={`https://player.vimeo.com/video/${selectedAsset.vimeo_video_id}?byline=0&title=0&portrait=0`}
                      allow="autoplay; fullscreen; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full border-0"
                      title={selectedAsset.title || 'Video'}
                    />
                  </div>
                ) : selectedAsset.current_version?.previewPath && accessToken ? (
                  <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-8">
                    <img
                      src={ensureTokenUrl(selectedAsset.current_version.previewPath, accessToken)}
                      alt={selectedAsset.title}
                      className="max-h-96 max-w-full object-contain"
                    />
                  </div>
                ) : null}
              </div>

              {/* Downloads */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Downloads</h3>
                {selectedAsset.asset_type === 'video' && selectedAsset.vimeo_video_id ? (
                  <>
                    {[
                      { quality: '1080p', url: selectedAsset.vimeo_download_1080p || null },
                      { quality: '720p', url: selectedAsset.vimeo_download_720p || null },
                      { quality: '480p', url: selectedAsset.vimeo_download_480p || null },
                      { quality: '360p', url: selectedAsset.vimeo_download_360p || null },
                    ]
                      .filter((item) => item.url && typeof item.url === 'string' && item.url.trim() !== '')
                      .map((item) => (
                        <button
                          key={item.quality}
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const filename = `${selectedAsset.title || 'video'}-${item.quality}.mp4`;
                            await triggerDownload(
                              item.url!,
                              filename,
                              selectedAsset.id,
                              `video-${item.quality}`,
                              accessToken
                            );
                          }}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition mr-2 mb-2"
                        >
                          <ArrowDownTrayIcon className="h-4 w-4" />
                          Download {item.quality}
                        </button>
                      ))}
                    {(!selectedAsset.vimeo_download_1080p || (typeof selectedAsset.vimeo_download_1080p === 'string' && selectedAsset.vimeo_download_1080p.trim() === '')) && 
                     (!selectedAsset.vimeo_download_720p || (typeof selectedAsset.vimeo_download_720p === 'string' && selectedAsset.vimeo_download_720p.trim() === '')) && 
                     (!selectedAsset.vimeo_download_480p || (typeof selectedAsset.vimeo_download_480p === 'string' && selectedAsset.vimeo_download_480p.trim() === '')) && 
                     (!selectedAsset.vimeo_download_360p || (typeof selectedAsset.vimeo_download_360p === 'string' && selectedAsset.vimeo_download_360p.trim() === '')) && (
                      <p className="text-sm text-gray-500 italic">
                        No download URLs available for this video.
                      </p>
                    )}
                  </>
                ) : selectedAsset.current_version?.downloadPath ? (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!accessToken) return;
                      const downloadUrl = ensureTokenUrl(selectedAsset.current_version!.downloadPath!, accessToken);
                      const filename = `${selectedAsset.title || 'asset'}.${selectedAsset.current_version!.mime_type?.split('/')[1] || 'bin'}`;
                      await triggerDownload(
                        downloadUrl,
                        filename,
                        selectedAsset.id,
                        'api',
                        accessToken
                      );
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    Download
                  </button>
                ) : (
                  <p className="text-sm text-gray-500">No download available</p>
                )}
              </div>

              {/* Metadata */}
              <div className="border-t border-gray-200 pt-6">
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  {selectedAsset.sku && (
                    <>
                      <dt className="font-medium text-gray-700">SKU</dt>
                      <dd className="text-gray-900">{selectedAsset.sku}</dd>
                    </>
                  )}
                  {selectedAsset.product_line && (
                    <>
                      <dt className="font-medium text-gray-700">Product Line</dt>
                      <dd className="text-gray-900">{selectedAsset.product_line}</dd>
                    </>
                  )}
                  {selectedAsset.locales.length > 0 && (
                    <>
                      <dt className="font-medium text-gray-700">Locales</dt>
                      <dd className="text-gray-900">{selectedAsset.locales.map((l) => l.label).join(', ')}</dd>
                    </>
                  )}
                  {selectedAsset.regions.length > 0 && (
                    <>
                      <dt className="font-medium text-gray-700">Regions</dt>
                      <dd className="text-gray-900">{selectedAsset.regions.map((r) => r.label).join(', ')}</dd>
                    </>
                  )}
                  {selectedAsset.tags.length > 0 && (
                    <>
                      <dt className="font-medium text-gray-700">Tags</dt>
                      <dd className="text-gray-900">{selectedAsset.tags.join(', ')}</dd>
                    </>
                  )}
                  {selectedAsset.current_version && (
                    <>
                      <dt className="font-medium text-gray-700">File Size</dt>
                      <dd className="text-gray-900">{formatBytes(selectedAsset.current_version.file_size)}</dd>
                      <dt className="font-medium text-gray-700">Type</dt>
                      <dd className="text-gray-900">{selectedAsset.current_version.mime_type || 'Unknown'}</dd>
                    </>
                  )}
                  <dt className="font-medium text-gray-700">Created</dt>
                  <dd className="text-gray-900">{new Date(selectedAsset.created_at).toLocaleString()}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

