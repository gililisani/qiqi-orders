'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSupabase } from '../../../lib/supabase-provider';
import AssetCard from '../../components/dam/AssetCard';
import AssetDetailModal from '../../components/dam/AssetDetailModal';
import { AssetRecord, LocaleOption, RegionOption } from '../../components/dam/types';
import { formatBytes, ensureTokenUrl, buildAuthHeaders } from '../../components/dam/utils';
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  PhotoIcon,
  FilmIcon,
  DocumentTextIcon,
  MusicalNoteIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';

const assetTypeOptions: Array<{ value: string; label: string; icon: JSX.Element }> = [
  { value: 'image', label: 'Image', icon: <PhotoIcon className="h-4 w-4" /> },
  { value: 'video', label: 'Video', icon: <FilmIcon className="h-4 w-4" /> },
  { value: 'document', label: 'Document', icon: <DocumentTextIcon className="h-4 w-4" /> },
  { value: 'audio', label: 'Audio', icon: <MusicalNoteIcon className="h-4 w-4" /> },
  { value: 'font', label: 'Font', icon: <DocumentTextIcon className="h-4 w-4" /> },
  { value: 'archive', label: 'Archive', icon: <Squares2X2Icon className="h-4 w-4" /> },
  { value: 'other', label: 'Other', icon: <Squares2X2Icon className="h-4 w-4" /> },
];

interface TagOption {
  id: string;
  slug: string;
  label: string;
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
  const [tags, setTags] = useState<TagOption[]>([]);
  const [productLines, setProductLines] = useState<Array<{ code: string; name: string; slug: string }>>([]);
  const [assetTypes, setAssetTypes] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [assetSubtypes, setAssetSubtypes] = useState<Array<{ id: string; name: string; slug: string; asset_type_id: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: number; item_name: string; sku: string }>>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>('');
  const [assetSubtypeFilter, setAssetSubtypeFilter] = useState<string>('');
  const [localeFilter, setLocaleFilter] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [productLineFilter, setProductLineFilter] = useState<string>('');
  const [productNameFilter, setProductNameFilter] = useState<string>('');
  const [dateFromFilter, setDateFromFilter] = useState<string>('');
  const [dateToFilter, setDateToFilter] = useState<string>('');
  const [fileSizeMinFilter, setFileSizeMinFilter] = useState<string>('');
  const [fileSizeMaxFilter, setFileSizeMaxFilter] = useState<string>('');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pagination, setPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  } | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'compact' | 'comfortable'>('compact');
  const [downloadingFormats, setDownloadingFormats] = useState<Set<string>>(new Set());

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
      const data = await response.json() as { 
        locales?: LocaleOption[]; 
        regions?: RegionOption[]; 
        tags?: Array<{ id: string; slug: string; label: string }>;
        assetTypes?: Array<{ id: string; name: string; slug: string }>;
        assetSubtypes?: Array<{ id: string; name: string; slug: string; asset_type_id: string }>;
        productLines?: Array<{ code: string; name: string; slug: string }>;
        products?: Array<{ id: number; item_name: string; sku: string }>;
      };
      setLocales(data.locales || []);
      setRegions(data.regions || []);
      setTags(data.tags || []);
      setAssetTypes(data.assetTypes || []);
      setAssetSubtypes(data.assetSubtypes || []);
      setProductLines(data.productLines || []);
      setProducts(data.products || []);
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
      if (assetTypeFilter) params.append('assetType', assetTypeFilter);
      if (assetSubtypeFilter) params.append('assetSubtype', assetSubtypeFilter);
      if (productLineFilter) params.append('productLine', productLineFilter);
      if (productNameFilter) params.append('productName', productNameFilter);
      if (localeFilter) params.append('locale', localeFilter);
      if (regionFilter) params.append('region', regionFilter);
      if (tagFilter) params.append('tag', tagFilter);
      if (dateFromFilter) params.append('dateFrom', dateFromFilter);
      if (dateToFilter) params.append('dateTo', dateToFilter);
      if (fileSizeMinFilter) params.append('fileSizeMin', fileSizeMinFilter);
      if (fileSizeMaxFilter) params.append('fileSizeMax', fileSizeMaxFilter);
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
  }, [accessToken, searchTerm, assetTypeFilter, assetSubtypeFilter, localeFilter, regionFilter, tagFilter, productLineFilter, productNameFilter, dateFromFilter, dateToFilter, fileSizeMinFilter, fileSizeMaxFilter, fetchLookups]);

  const filteredAssets = useMemo(() => {
    return assets; // Assets are already filtered by the API
  }, [assets]);

  const renderAssetTypePill = (assetType: string, size: 'sm' | 'md' = 'md') => {
    const option = assetTypeOptions.find((opt) => opt.value === assetType);
    const sizeClasses = size === 'sm' 
      ? 'text-[10px] px-1.5 py-0.5'
      : 'text-xs px-2 py-1';
    return (
      <span className={`inline-flex items-center gap-0.5 rounded-md bg-gray-100 ${sizeClasses} text-gray-700`}>
        {option?.icon}
        {option?.label ?? assetType}
      </span>
    );
  };

  const handleDownload = async (asset: AssetRecord, format?: string) => {
    if (!accessToken) return;
    
    const downloadKey = format ? `asset-action-${asset.id}-${format}` : `asset-action-${asset.id}`;
    setDownloadingFormats(prev => new Set(prev).add(downloadKey));

    try {
      if (asset.asset_type === 'video' && asset.vimeo_video_id) {
        const formats = asset.vimeo_download_formats && asset.vimeo_download_formats.length > 0
          ? asset.vimeo_download_formats.filter(f => f.url && f.url.trim() !== '')
          : [
              { resolution: '1080p', url: asset.vimeo_download_1080p || '' },
              { resolution: '720p', url: asset.vimeo_download_720p || '' },
              { resolution: '480p', url: asset.vimeo_download_480p || '' },
              { resolution: '360p', url: asset.vimeo_download_360p || '' },
            ].filter(f => f.url);
        
        const formatToDownload = format 
          ? formats.find(f => f.resolution === format)
          : formats[0];
        
        if (formatToDownload && formatToDownload.url) {
          const filename = `${asset.title || 'video'}-${formatToDownload.resolution}.mp4`;
          await triggerDownload(
            formatToDownload.url,
            filename,
            asset.id,
            `video-${formatToDownload.resolution}`,
            accessToken
          );
        }
      } else if (asset.current_version?.downloadPath) {
        const downloadUrl = ensureTokenUrl(asset.current_version.downloadPath, accessToken);
        const filename = `${asset.title || 'asset'}.${asset.current_version.mime_type?.split('/')[1] || 'bin'}`;
        await triggerDownload(
          downloadUrl,
          filename,
          asset.id,
          'api',
          accessToken
        );
      }
    } catch (err: any) {
      console.error('Download failed:', err);
      setError(err.message || 'Download failed');
    } finally {
      setDownloadingFormats(prev => {
        const next = new Set(prev);
        next.delete(downloadKey);
        return next;
      });
    }
  };

  const getActiveFilterChips = () => {
    const chips: Array<{ label: string; onRemove: () => void }> = [];
    
    if (assetTypeFilter) {
      const type = assetTypes.find(t => t.id === assetTypeFilter);
      if (type) {
        chips.push({
          label: type.name,
          onRemove: () => {
            setAssetTypeFilter('');
            setAssetSubtypeFilter('');
          },
        });
      }
    }
    
    if (assetSubtypeFilter) {
      const subtype = assetSubtypes.find(s => s.id === assetSubtypeFilter);
      if (subtype) {
        chips.push({
          label: subtype.name,
          onRemove: () => setAssetSubtypeFilter(''),
        });
      }
    }
    
    if (productLineFilter) {
      const pl = productLines.find(p => p.code === productLineFilter);
      chips.push({
        label: pl?.name || productLineFilter,
        onRemove: () => setProductLineFilter(''),
      });
    }
    
    if (productNameFilter) {
      chips.push({
        label: productNameFilter,
        onRemove: () => setProductNameFilter(''),
      });
    }
    
    if (localeFilter) {
      const locale = locales.find(l => l.code === localeFilter);
      if (locale) {
        chips.push({
          label: locale.label,
          onRemove: () => setLocaleFilter(''),
        });
      }
    }
    
    if (regionFilter) {
      const region = regions.find(r => r.code === regionFilter);
      if (region) {
        chips.push({
          label: region.label,
          onRemove: () => setRegionFilter(''),
        });
      }
    }
    
    if (tagFilter) {
      chips.push({
        label: tagFilter,
        onRemove: () => setTagFilter(''),
      });
    }
    
    return chips;
  };

  if (error && !loadingAssets) {
    return (
      <div className="mt-8 mb-4 space-y-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          <p>Error loading assets: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gray-50">
      {/* Main Content - Full Width */}
      <div className="w-full">
        {/* Header with Search Bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-3">
            {/* Large Search Bar */}
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search assets by title, tag, SKU, product…"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-md border border-gray-300 focus:border-black focus:outline-none focus:ring-1 focus:ring-black/10 text-sm"
              />
            </div>
            
            {/* View Mode Toggle - Segmented Control */}
            <div className="inline-flex items-center rounded-lg border border-gray-300 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  viewMode === 'compact'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Compact
              </button>
              <button
                type="button"
                onClick={() => setViewMode('comfortable')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  viewMode === 'comfortable'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Comfortable
              </button>
            </div>
            
            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => {
                setCurrentPage(1);
                fetchAssets(accessToken ?? '', undefined, 1);
              }}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 w-9 h-9 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <ArrowPathIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter Row */}
        <div className="bg-white border-b border-gray-200 px-6 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Filter Dropdowns */}
            <select
              value={assetTypeFilter}
              onChange={(event) => {
                setAssetTypeFilter(event.target.value);
                setAssetSubtypeFilter('');
              }}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs focus:border-black focus:outline-none bg-white h-8"
            >
              <option value="">Asset Type</option>
              {assetTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>

            <select
              value={assetSubtypeFilter}
              onChange={(event) => setAssetSubtypeFilter(event.target.value)}
              disabled={!assetTypeFilter}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:border-black focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
            >
              <option value="">Sub-Type</option>
              {assetSubtypes
                .filter((subtype) => subtype.asset_type_id === assetTypeFilter)
                .map((subtype) => (
                  <option key={subtype.id} value={subtype.id}>
                    {subtype.name}
                  </option>
                ))}
            </select>

            <select
              value={productLineFilter}
              onChange={(event) => setProductLineFilter(event.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs focus:border-black focus:outline-none bg-white h-8"
            >
              <option value="">Product Line</option>
              {productLines.map(pl => (
                <option key={pl.code} value={pl.code}>{pl.name}</option>
              ))}
            </select>

            <select
              value={productNameFilter}
              onChange={(event) => setProductNameFilter(event.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs focus:border-black focus:outline-none bg-white h-8"
            >
              <option value="">Product</option>
              {products.map((product) => (
                <option key={product.id} value={product.item_name}>
                  {product.item_name}
                </option>
              ))}
            </select>

            <select
              value={localeFilter}
              onChange={(event) => setLocaleFilter(event.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs focus:border-black focus:outline-none bg-white h-8"
            >
              <option value="">Locale</option>
              {locales.map((locale) => (
                <option key={locale.code} value={locale.code}>
                  {locale.label}
                </option>
              ))}
            </select>

            <select
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs focus:border-black focus:outline-none bg-white h-8"
            >
              <option value="">Region</option>
              {regions.map((region) => (
                <option key={region.code} value={region.code}>
                  {region.label}
                </option>
              ))}
            </select>

            <select
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs focus:border-black focus:outline-none bg-white h-8"
            >
              <option value="">Tag</option>
              {tags.map((tag) => (
                <option key={tag.slug} value={tag.label}>
                  {tag.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Chips */}
          {getActiveFilterChips().length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pt-1.5 border-t border-gray-100">
              {getActiveFilterChips().map((chip, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    className="hover:text-gray-900"
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Asset Library - Full Width */}
        <div className="px-6 py-4 border-t border-gray-100">
          {/* Advanced Search Accordion */}
          <div className="mb-4 rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <h4 className="text-sm font-semibold text-gray-900">Advanced Search</h4>
              <svg
                className={`h-5 w-5 text-gray-500 transition-transform ${showAdvancedSearch ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showAdvancedSearch && (
              <div className="px-4 pb-4 border-t border-gray-200">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 pt-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Date From</label>
                    <input
                      type="date"
                      value={dateFromFilter}
                      onChange={(event) => setDateFromFilter(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Date To</label>
                    <input
                      type="date"
                      value={dateToFilter}
                      onChange={(event) => setDateToFilter(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Min File Size (MB)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={fileSizeMinFilter}
                      onChange={(event) => setFileSizeMinFilter(event.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Max File Size (MB)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={fileSizeMaxFilter}
                      onChange={(event) => setFileSizeMaxFilter(event.target.value)}
                      placeholder="∞"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                    />
                  </div>
                </div>
                {(dateFromFilter || dateToFilter || fileSizeMinFilter || fileSizeMaxFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFromFilter('');
                      setDateToFilter('');
                      setFileSizeMinFilter('');
                      setFileSizeMaxFilter('');
                      setCurrentPage(1);
                      fetchAssets(accessToken ?? '', searchTerm || undefined, 1);
                    }}
                    className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Clear advanced filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Asset Grid */}
          {loadingAssets ? (
            // Skeleton loaders while loading (matching admin)
            <div className={`grid gap-2 ${
              viewMode === 'compact'
                ? 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
                : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
            }`}>
              {Array.from({ length: 12 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="bg-white rounded-md border border-gray-200 overflow-hidden shadow-sm"
                  style={{ maxWidth: viewMode === 'compact' ? '240px' : undefined }}
                >
                  <div className="relative bg-gray-200 animate-pulse" style={{ height: viewMode === 'compact' ? '160px' : '200px' }} />
                  <div className="p-2 space-y-1">
                    <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
                    <div className="h-2 bg-gray-200 rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-600">
              No assets found. Try adjusting your filters.
            </div>
          ) : (
            <div className={`grid gap-2 ${
              viewMode === 'compact'
                ? 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
                : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
            }`}>
              {filteredAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  viewMode={viewMode}
                  accessToken={accessToken}
                  hoveredAssetId={hoveredAssetId}
                  onMouseEnter={setHoveredAssetId}
                  onMouseLeave={() => setHoveredAssetId(null)}
                  onClick={setSelectedAsset}
                  isAdmin={false}
                  onDownload={async (asset) => {
                    if (!accessToken) return;
                    const cardDownloadKey = `card-${asset.id}`;
                    setDownloadingFormats(prev => new Set(prev).add(cardDownloadKey));
                    try {
                      if (asset.current_version?.downloadPath) {
                        const downloadUrl = ensureTokenUrl(asset.current_version.downloadPath, accessToken);
                        const filename = asset.current_version.originalFileName || `${asset.title || 'asset'}.${asset.current_version.mime_type?.split('/')[1] || 'bin'}`;
                        await triggerDownload(
                          downloadUrl,
                          filename,
                          asset.id,
                          'api',
                          accessToken
                        );
                      }
                    } finally {
                      setDownloadingFormats(prev => {
                        const next = new Set(prev);
                        next.delete(cardDownloadKey);
                        return next;
                      });
                    }
                  }}
                  downloadingFormats={downloadingFormats}
                  assetSubtypes={assetSubtypes}
                  renderAssetTypePill={renderAssetTypePill}
                />
              ))}
            </div>
          )}
          
          {/* Pagination */}
          {pagination && pagination.total > 0 && (
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
        </div>
      </div>

      {/* Asset Detail Modal */}
      {selectedAsset && (
        <AssetDetailModal
          asset={selectedAsset}
          accessToken={accessToken}
          onClose={() => setSelectedAsset(null)}
          onDownload={handleDownload}
          downloadingFormats={downloadingFormats}
          isAdmin={false}
          renderAssetTypePill={renderAssetTypePill}
        />
      )}
    </div>
  );
}
