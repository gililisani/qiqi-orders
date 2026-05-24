'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Image as ImageIcon,
  Film,
  FileText,
  Music,
  Grid3x3,
  Search,
  X,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';

import { useSupabase } from '../../../lib/supabase-provider';
import AssetCard from '../../components/dam/AssetCard';
import AssetDetailModal from '../../components/dam/AssetDetailModal';
import { AssetRecord, LocaleOption, RegionOption } from '../../components/dam/types';
import {
  buildAuthHeaders,
  resolveSignedAssetUrl,
  resolveSignedPreviewUrlsBatch,
} from '../../components/dam/utils';

import { PageHeader } from '../../components/qq/page-header';
import { Card } from '../../components/qq/card';
import { Input } from '../../components/qq/input';
import { Button } from '../../components/qq/button';
import { Alert, AlertDescription } from '../../components/qq/alert';
import { Pagination } from '../../components/qq/pagination';
import { EmptyState } from '../../components/qq/empty-state';
import { Label } from '../../components/qq/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/qq/select';
import { useToast } from '../../components/ui/ToastProvider';

const ALL = '__all__';

const assetTypeOptions: Array<{ value: string; label: string; icon: JSX.Element }> = [
  { value: 'image', label: 'Image', icon: <ImageIcon className="h-3.5 w-3.5" /> },
  { value: 'video', label: 'Video', icon: <Film className="h-3.5 w-3.5" /> },
  { value: 'document', label: 'Document', icon: <FileText className="h-3.5 w-3.5" /> },
  { value: 'audio', label: 'Audio', icon: <Music className="h-3.5 w-3.5" /> },
  { value: 'font', label: 'Font', icon: <FileText className="h-3.5 w-3.5" /> },
  { value: 'archive', label: 'Archive', icon: <Grid3x3 className="h-3.5 w-3.5" /> },
  { value: 'other', label: 'Other', icon: <Grid3x3 className="h-3.5 w-3.5" /> },
];

interface TagOption { id: string; slug: string; label: string }

async function logDownload(
  assetId: string,
  downloadUrl: string,
  downloadMethod: string,
  accessToken: string | null
): Promise<void> {
  if (!accessToken) return;
  try {
    await fetch('/api/dam/downloads/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(accessToken) },
      credentials: 'same-origin',
      body: JSON.stringify({ assetId, downloadUrl, downloadMethod }),
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
    try {
      const u = new URL(url, window.location.href);
      if (u.origin !== window.location.origin) {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        void logDownload(assetId, url, downloadMethod, accessToken);
        return;
      }
    } catch {
      /* fall through */
    }

    await logDownload(assetId, url, downloadMethod, accessToken);

    try {
      const response = await fetch(url, { method: 'GET', mode: 'cors' });
      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        return;
      }
    } catch {
      /* fall through to direct link */
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
  const toast = useToast();

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
  const [pageSize, setPageSize] = useState<number>(25);
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

  // ---------- Session ----------
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

  // ---------- Lookups ----------
  const fetchLookups = useCallback(async (token: string) => {
    try {
      const headers = buildAuthHeaders(token);
      const res = await fetch('/api/dam/lookups', {
        headers: Object.keys(headers).length ? headers : undefined,
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Failed to load lookups');
      const data = (await res.json()) as {
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
    } catch (err) {
      console.error('Failed to load lookups', err);
    }
  }, []);

  // ---------- Assets ----------
  const fetchAssets = async (token: string, search?: string, page = 1) => {
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
      params.append('limit', pageSize.toString());

      const res = await fetch(`/api/dam/assets/client?${params.toString()}`, {
        method: 'GET',
        headers: Object.keys(headers).length ? headers : undefined,
        credentials: 'same-origin',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load assets');
      }
      const payload = (await res.json()) as { assets?: AssetRecord[]; pagination?: any };
      setAssets(payload.assets || []);
      setPagination(payload.pagination || null);
      setCurrentPage(page);

      // Prime thumbnail URL cache
      try {
        const previewPaths = (payload.assets ?? [])
          .map((a: any) => a?.current_version?.previewPath)
          .filter(Boolean);
        void resolveSignedPreviewUrlsBatch(previewPaths, token);
      } catch {
        /* best-effort */
      }
    } catch (err: any) {
      console.error('Failed to load assets', err);
      setError(err.message || 'Failed to load assets');
    } finally {
      setLoadingAssets(false);
    }
  };

  // Re-fetch on filter / search / page-size change (debounced via timeout)
  useEffect(() => {
    if (!accessToken) return;
    fetchLookups(accessToken);
    const timeoutId = setTimeout(() => {
      fetchAssets(accessToken, searchTerm || undefined, 1);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accessToken,
    searchTerm,
    assetTypeFilter,
    assetSubtypeFilter,
    localeFilter,
    regionFilter,
    tagFilter,
    productLineFilter,
    productNameFilter,
    pageSize,
    dateFromFilter,
    dateToFilter,
    fileSizeMinFilter,
    fileSizeMaxFilter,
    fetchLookups,
  ]);

  // Persisted page size
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('dam_client_page_size');
      const parsed = raw ? parseInt(raw, 10) : NaN;
      if (parsed === 25 || parsed === 50 || parsed === 100) setPageSize(parsed);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem('dam_client_page_size', String(pageSize));
    } catch {
      /* ignore */
    }
  }, [pageSize]);

  const filteredAssets = useMemo(() => assets, [assets]);

  const renderAssetTypePill = (assetType: string, size: 'sm' | 'md' = 'md') => {
    const option = assetTypeOptions.find((o) => o.value === assetType);
    const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
    return (
      <span className={`inline-flex items-center gap-1 rounded-sm bg-muted ${sizeClasses} text-muted-foreground`}>
        {option?.icon}
        {option?.label ?? assetType}
      </span>
    );
  };

  const handleDownload = async (asset: AssetRecord, format?: string) => {
    if (!accessToken) return;
    const downloadKey = format ? `asset-action-${asset.id}-${format}` : `asset-action-${asset.id}`;
    setDownloadingFormats((prev) => new Set(prev).add(downloadKey));
    try {
      if (asset.asset_type === 'video' && asset.vimeo_video_id) {
        const formats = asset.vimeo_download_formats && asset.vimeo_download_formats.length > 0
          ? asset.vimeo_download_formats.filter((f) => f.url && f.url.trim() !== '')
          : [
              { resolution: '1080p', url: asset.vimeo_download_1080p || '' },
              { resolution: '720p', url: asset.vimeo_download_720p || '' },
              { resolution: '480p', url: asset.vimeo_download_480p || '' },
              { resolution: '360p', url: asset.vimeo_download_360p || '' },
            ].filter((f) => f.url);

        const formatToDownload = format ? formats.find((f) => f.resolution === format) : formats[0];
        if (formatToDownload?.url) {
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
        const downloadUrl = await resolveSignedAssetUrl(asset.current_version.downloadPath, accessToken);
        if (!downloadUrl) throw new Error('Download link unavailable. Please try again.');
        const filename = `${asset.title || 'asset'}.${asset.current_version.mime_type?.split('/')[1] || 'bin'}`;
        await triggerDownload(downloadUrl, filename, asset.id, 'api', accessToken);
      }
    } catch (err: any) {
      console.error('Download failed:', err);
      toast.error(err.message || 'Download failed');
    } finally {
      setDownloadingFormats((prev) => {
        const next = new Set(prev);
        next.delete(downloadKey);
        return next;
      });
    }
  };

  // ---------- Filter chips ----------
  const activeChips = (() => {
    const chips: Array<{ label: string; onRemove: () => void }> = [];
    if (assetTypeFilter) {
      const t = assetTypes.find((x) => x.id === assetTypeFilter);
      if (t) chips.push({ label: t.name, onRemove: () => { setAssetTypeFilter(''); setAssetSubtypeFilter(''); } });
    }
    if (assetSubtypeFilter) {
      const s = assetSubtypes.find((x) => x.id === assetSubtypeFilter);
      if (s) chips.push({ label: s.name, onRemove: () => setAssetSubtypeFilter('') });
    }
    if (productLineFilter) {
      const pl = productLines.find((x) => x.code === productLineFilter);
      chips.push({ label: pl?.name || productLineFilter, onRemove: () => setProductLineFilter('') });
    }
    if (productNameFilter) chips.push({ label: productNameFilter, onRemove: () => setProductNameFilter('') });
    if (localeFilter) {
      const l = locales.find((x) => x.code === localeFilter);
      if (l) chips.push({ label: l.label, onRemove: () => setLocaleFilter('') });
    }
    if (regionFilter) {
      const r = regions.find((x) => x.code === regionFilter);
      if (r) chips.push({ label: r.label, onRemove: () => setRegionFilter('') });
    }
    if (tagFilter) chips.push({ label: tagFilter, onRemove: () => setTagFilter('') });
    return chips;
  })();

  const advancedDirty = !!(dateFromFilter || dateToFilter || fileSizeMinFilter || fileSizeMaxFilter);

  if (error && !loadingAssets && assets.length === 0) {
    return (
      <div className="px-6 py-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-4">
      <PageHeader
        title="Assets"
        description="Browse the Qiqi asset library — images, videos, documents, and more."
        actions={
          <>
            {/* View-mode segmented control */}
            <div className="inline-flex items-center rounded-md border border-border bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
                  viewMode === 'compact'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Compact
              </button>
              <button
                type="button"
                onClick={() => setViewMode('comfortable')}
                className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
                  viewMode === 'comfortable'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Comfortable
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCurrentPage(1);
                fetchAssets(accessToken ?? '', undefined, 1);
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </>
        }
      />

      {/* Search + filters card */}
      <Card>
        <div className="p-3 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search assets by title, tag, SKU, product…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filter selects */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            <FilterSelect
              value={assetTypeFilter}
              onValueChange={(v) => {
                setAssetTypeFilter(v);
                setAssetSubtypeFilter('');
              }}
              placeholder="Asset type"
              options={assetTypes.map((t) => ({ value: t.id, label: t.name }))}
            />
            <FilterSelect
              value={assetSubtypeFilter}
              onValueChange={setAssetSubtypeFilter}
              placeholder="Sub-type"
              disabled={!assetTypeFilter}
              options={assetSubtypes
                .filter((s) => s.asset_type_id === assetTypeFilter)
                .map((s) => ({ value: s.id, label: s.name }))}
            />
            <FilterSelect
              value={productLineFilter}
              onValueChange={setProductLineFilter}
              placeholder="Product line"
              options={productLines.map((p) => ({ value: p.code, label: p.name }))}
            />
            <FilterSelect
              value={productNameFilter}
              onValueChange={setProductNameFilter}
              placeholder="Product"
              options={products.map((p) => ({ value: p.item_name, label: p.item_name }))}
            />
            <FilterSelect
              value={localeFilter}
              onValueChange={setLocaleFilter}
              placeholder="Locale"
              options={locales.map((l) => ({ value: l.code, label: l.label }))}
            />
            <FilterSelect
              value={regionFilter}
              onValueChange={setRegionFilter}
              placeholder="Region"
              options={regions.map((r) => ({ value: r.code, label: r.label }))}
            />
            <FilterSelect
              value={tagFilter}
              onValueChange={setTagFilter}
              placeholder="Tag"
              options={tags.map((t) => ({ value: t.label, label: t.label }))}
            />
          </div>

          {/* Active chips */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border">
              {activeChips.map((chip, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-sm border border-brand-periwinkle/30 bg-brand-periwinkle/10 px-2 py-0.5 text-xs font-medium text-brand-periwinkle"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    className="hover:opacity-70"
                    aria-label={`Remove ${chip.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Advanced search */}
      <Card>
        <button
          type="button"
          onClick={() => setShowAdvancedSearch((v) => !v)}
          className="w-full flex items-center justify-between p-3 text-left"
        >
          <span className="text-sm font-medium">
            Advanced search
            {advancedDirty && (
              <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-brand-periwinkle" />
            )}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              showAdvancedSearch ? 'rotate-180' : ''
            }`}
          />
        </button>
        {showAdvancedSearch && (
          <div className="px-3 pb-3 border-t border-border">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-3">
              <div>
                <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Date from
                </Label>
                <Input
                  type="date"
                  value={dateFromFilter}
                  onChange={(e) => setDateFromFilter(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Date to
                </Label>
                <Input
                  type="date"
                  value={dateToFilter}
                  onChange={(e) => setDateToFilter(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Min file size (MB)
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={fileSizeMinFilter}
                  onChange={(e) => setFileSizeMinFilter(e.target.value)}
                  placeholder="0"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Max file size (MB)
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={fileSizeMaxFilter}
                  onChange={(e) => setFileSizeMaxFilter(e.target.value)}
                  placeholder="∞"
                  className="mt-1.5"
                />
              </div>
            </div>
            {advancedDirty && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-muted-foreground"
                onClick={() => {
                  setDateFromFilter('');
                  setDateToFilter('');
                  setFileSizeMinFilter('');
                  setFileSizeMaxFilter('');
                }}
              >
                Clear advanced filters
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Asset grid */}
      {loadingAssets ? (
        <div
          className={`grid gap-2 ${
            viewMode === 'compact'
              ? 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
              : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
          }`}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="bg-background rounded-md border border-border overflow-hidden"
              style={{ maxWidth: viewMode === 'compact' ? '240px' : undefined }}
            >
              <div
                className="bg-muted/40 animate-pulse"
                style={{ height: viewMode === 'compact' ? '160px' : '200px' }}
              />
              <div className="p-2 space-y-1">
                <div className="h-3 bg-muted/40 rounded animate-pulse w-3/4" />
                <div className="h-2 bg-muted/40 rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredAssets.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search />}
            title="No assets match your filters"
            description="Try a different search or clear the filters."
            action={
              activeChips.length > 0 || advancedDirty ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAssetTypeFilter('');
                    setAssetSubtypeFilter('');
                    setLocaleFilter('');
                    setRegionFilter('');
                    setTagFilter('');
                    setProductLineFilter('');
                    setProductNameFilter('');
                    setDateFromFilter('');
                    setDateToFilter('');
                    setFileSizeMinFilter('');
                    setFileSizeMaxFilter('');
                    setSearchTerm('');
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
            className="border-0 shadow-none"
          />
        </Card>
      ) : (
        <div
          className={`grid gap-2 ${
            viewMode === 'compact'
              ? 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
              : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
          }`}
        >
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
              onDownload={async (a) => {
                if (!accessToken) return;
                const cardDownloadKey = `card-${a.id}`;
                setDownloadingFormats((prev) => new Set(prev).add(cardDownloadKey));
                try {
                  if (a.current_version?.downloadPath) {
                    const downloadUrl = await resolveSignedAssetUrl(
                      a.current_version.downloadPath,
                      accessToken
                    );
                    if (!downloadUrl) throw new Error('Download link unavailable. Please try again.');
                    const filename =
                      a.current_version.originalFileName ||
                      `${a.title || 'asset'}.${a.current_version.mime_type?.split('/')[1] || 'bin'}`;
                    await triggerDownload(downloadUrl, filename, a.id, 'api', accessToken);
                  }
                } catch (err: any) {
                  toast.error(err.message || 'Download failed');
                } finally {
                  setDownloadingFormats((prev) => {
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
        <Card>
          <Pagination
            page={currentPage}
            totalPages={Math.max(1, pagination.totalPages)}
            onPageChange={(p) => {
              setCurrentPage(p);
              fetchAssets(accessToken ?? '', searchTerm || undefined, p);
            }}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            totalItems={pagination.total}
          />
        </Card>
      )}

      {/* Detail modal */}
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

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function FilterSelect({
  value,
  onValueChange,
  placeholder,
  options,
  disabled = false,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value || ALL}
      onValueChange={(v) => onValueChange(v === ALL ? '' : v)}
      disabled={disabled}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
