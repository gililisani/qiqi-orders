'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Trash2,
  Image as ImageIcon,
  Calendar,
  ArrowLeft,
  X,
  Check,
  Search,
} from 'lucide-react';

import { useSupabase } from '../../../../../lib/supabase-provider';
import AssetCard from '../../../../components/dam/AssetCard';
import AssetDetailModal from '../../../../components/dam/AssetDetailModal';
import { AssetRecord } from '../../../../components/dam/types';
import { ensureTokenUrl, buildAuthHeaders } from '../../../../components/dam/utils';

import { PageHeader } from '../../../../components/qq/page-header';
import { Card } from '../../../../components/qq/card';
import { Button } from '../../../../components/qq/button';
import { Input } from '../../../../components/qq/input';
import { Badge } from '../../../../components/qq/badge';
import { Alert, AlertDescription } from '../../../../components/qq/alert';
import { EmptyState } from '../../../../components/qq/empty-state';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../../components/qq/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/qq/select';
import { useToast } from '../../../../components/ui/ToastProvider';
import { useConfirm } from '../../../../components/ui/ConfirmProvider';

const ALL = '__all__';

interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  thumbnail_asset_id?: string | null;
  product_line?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
  updated_at: string;
  thumbnail_path?: string | null;
}

export default function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;
  const { session, supabase } = useSupabase();
  const toast = useToast();
  const confirm = useConfirm();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showAddAssetsModal, setShowAddAssetsModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'compact' | 'comfortable'>('compact');
  const [downloadingFormats, setDownloadingFormats] = useState<Set<string>>(new Set());
  const [assetSubtypes, setAssetSubtypes] = useState<Array<{ id: string; name: string; slug: string; asset_type_id: string }>>([]);

  const [accessToken, setAccessToken] = useState<string | null>(session?.access_token ?? null);

  useEffect(() => {
    let active = true;
    if (!accessToken && supabase) {
      supabase.auth.getSession().then(({ data }: { data: { session: { access_token: string } | null } }) => {
        if (!active) return;
        setAccessToken(data.session?.access_token ?? null);
      });
    }
    return () => { active = false; };
  }, [accessToken, supabase]);

  useEffect(() => {
    if (session?.access_token) setAccessToken(session.access_token);
  }, [session]);

  const fetchLookups = async () => {
    if (!accessToken) return;
    try {
      const headers = buildAuthHeaders(accessToken);
      const response = await fetch('/api/dam/lookups', {
        method: 'GET',
        headers: Object.keys(headers).length ? headers : undefined,
        credentials: 'same-origin',
      });
      if (response.ok) {
        const payload = await response.json();
        setAssetSubtypes(payload.assetSubtypes || []);
      }
    } catch (err) {
      console.error('Failed to load lookup data', err);
    }
  };

  const fetchCampaign = async () => {
    if (!campaignId) {
      setStatus('error');
      setErrorMessage('Campaign ID is required');
      return;
    }
    if (!accessToken) {
      setStatus('error');
      setErrorMessage('Authentication required');
      return;
    }
    try {
      setStatus('loading');
      const headers = buildAuthHeaders(accessToken);
      const response = await fetch(`/api/campaigns/${campaignId}`, { headers });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setStatus('error');
        setErrorMessage(errorData.error || `Failed to fetch campaign: ${response.status}`);
        setCampaign(null);
        setAssets([]);
        return;
      }
      const data = await response.json();
      if (!data.campaign) {
        setStatus('error');
        setErrorMessage('Campaign data is missing');
        return;
      }
      setCampaign(data.campaign);
      setAssets(data.assets || []);
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Failed to load campaign');
    }
  };

  useEffect(() => {
    if (!campaignId) {
      setStatus('error');
      setErrorMessage('Campaign ID is required');
      return;
    }
    if (!accessToken) return;
    fetchCampaign();
    fetchLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, accessToken]);

  const handleRemoveAsset = async (assetId: string) => {
    const ok = await confirm({
      title: 'Remove from campaign?',
      description: 'The asset stays in the library; it just leaves this campaign.',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const headers = buildAuthHeaders(accessToken);
      headers['Content-Type'] = 'application/json';
      const response = await fetch(`/api/campaigns/${campaignId}/remove-asset`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ assetId }),
      });
      if (!response.ok) throw new Error('Failed to remove asset');
      setAssets(assets.filter((a) => a.id !== assetId));
      toast.success('Asset removed from campaign.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove asset from campaign.');
    }
  };

  const handleDownload = async (asset: AssetRecord, format?: string) => {
    if (!asset.current_version?.downloadPath) return;
    const downloadKey = format ? `video-${asset.id}-${format}` : `asset-action-${asset.id}`;
    setDownloadingFormats((prev) => new Set(prev).add(downloadKey));
    try {
      const downloadUrl = ensureTokenUrl(asset.current_version.downloadPath, accessToken);
      const filename = asset.use_title_as_filename && asset.title
        ? `${asset.title}.${asset.current_version.mime_type?.split('/')[1] || 'bin'}`
        : asset.current_version.originalFileName ||
          `${asset.title || 'asset'}.${asset.current_version.mime_type?.split('/')[1] || 'bin'}`;

      if (format && asset.vimeo_download_formats) {
        const formatObj = asset.vimeo_download_formats.find((f) => f.resolution === format);
        if (formatObj?.url) {
          const link = document.createElement('a');
          link.href = formatObj.url;
          link.download = `${asset.title || 'video'}_${format}.mp4`;
          link.click();
          return;
        }
      }

      const response = await fetch(downloadUrl, { headers: buildAuthHeaders(accessToken) });
      if (!response.ok) throw new Error('Download failed');
      let downloadFilename = filename;
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        const m = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (m && m[1]) downloadFilename = m[1].replace(/['"]/g, '');
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      toast.error(err.message || 'Failed to download asset.');
    } finally {
      setDownloadingFormats((prev) => {
        const next = new Set(prev);
        next.delete(downloadKey);
        return next;
      });
    }
  };

  const formatDateRange = (startDate?: string | null, endDate?: string | null) => {
    if (!startDate && !endDate) return null;
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (startDate && endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
    if (startDate) return `From ${fmt(startDate)}`;
    if (endDate) return `Until ${fmt(endDate)}`;
    return null;
  };

  const renderAssetTypePill = (type: string, size: 'sm' | 'md' = 'md') => {
    const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
    return (
      <span className={`inline-flex items-center rounded-sm bg-muted ${sizeClasses} text-muted-foreground capitalize`}>
        {type}
      </span>
    );
  };

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading campaign…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="px-6 py-8">
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{errorMessage || 'Failed to load campaign.'}</AlertDescription>
        </Alert>
        <Link href="/admin/dam/campaigns">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back to campaigns
          </Button>
        </Link>
      </div>
    );
  }

  if (!campaign) return null;

  return (
    <div className="px-6 py-8 space-y-4">
      <div>
        <Link
          href="/admin/dam/campaigns"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to campaigns
        </Link>
      </div>

      <PageHeader
        title={campaign.name}
        description={campaign.description || undefined}
        actions={
          <>
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
            <Button size="sm" onClick={() => setShowAddAssetsModal(true)}>
              <Plus className="h-4 w-4" /> Add assets
            </Button>
          </>
        }
      />

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {campaign.product_line && <Badge variant="muted">{campaign.product_line}</Badge>}
        {formatDateRange(campaign.start_date, campaign.end_date) && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {formatDateRange(campaign.start_date, campaign.end_date)}
          </span>
        )}
        <span>{assets.length} {assets.length === 1 ? 'asset' : 'assets'}</span>
      </div>

      {/* Assets */}
      {assets.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ImageIcon />}
            title="No assets in this campaign yet"
            description="Pick assets from the library to attach them to this campaign."
            action={
              <Button size="sm" onClick={() => setShowAddAssetsModal(true)}>
                <Plus className="h-4 w-4" /> Add assets
              </Button>
            }
            className="border-0 shadow-none"
          />
        </Card>
      ) : (
        <div
          className={`grid gap-2 ${
            viewMode === 'compact'
              ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'
              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
          }`}
        >
          {assets.map((asset) => (
            <div key={asset.id} className="relative group">
              <AssetCard
                asset={asset}
                viewMode={viewMode}
                accessToken={accessToken}
                hoveredAssetId={hoveredAssetId}
                onMouseEnter={setHoveredAssetId}
                onMouseLeave={() => setHoveredAssetId(null)}
                onClick={setSelectedAsset}
                isAdmin={true}
                onDownload={handleDownload}
                onDelete={(id) => handleRemoveAsset(id)}
                downloadingFormats={downloadingFormats}
                assetSubtypes={assetSubtypes}
                renderAssetTypePill={renderAssetTypePill}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveAsset(asset.id);
                }}
                className="absolute top-2 right-2 z-30 inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/95 text-destructive shadow-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background"
                title="Remove from campaign"
                aria-label="Remove from campaign"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedAsset && (
        <AssetDetailModal
          asset={selectedAsset}
          accessToken={accessToken}
          onClose={() => setSelectedAsset(null)}
          onDownload={handleDownload}
          downloadingFormats={downloadingFormats}
          isAdmin={true}
          renderAssetTypePill={renderAssetTypePill}
        />
      )}

      {showAddAssetsModal && (
        <AddAssetsModal
          campaignId={campaignId}
          existingAssetIds={assets.map((a) => a.id)}
          onClose={() => setShowAddAssetsModal(false)}
          onAssetsAdded={() => {
            fetchCampaign();
            setShowAddAssetsModal(false);
          }}
          accessToken={accessToken}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Add Assets Modal
// ----------------------------------------------------------------------------
interface AddAssetsModalProps {
  campaignId: string;
  existingAssetIds: string[];
  onClose: () => void;
  onAssetsAdded: () => void;
  accessToken: string | null;
}

function AddAssetsModal({
  campaignId,
  existingAssetIds,
  onClose,
  onAssetsAdded,
  accessToken,
}: AddAssetsModalProps) {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [filters, setFilters] = useState({
    assetType: '',
    productLine: '',
  });

  useEffect(() => {
    fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filters]);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const headers = buildAuthHeaders(accessToken);
      const params = new URLSearchParams();
      if (searchTerm) params.set('q', searchTerm);
      if (filters.assetType) params.set('assetType', filters.assetType);
      if (filters.productLine) params.set('productLine', filters.productLine);
      params.set('limit', '100');
      const response = await fetch(`/api/dam/assets?${params.toString()}`, { headers });
      if (!response.ok) throw new Error('Failed to fetch assets');
      const data = await response.json();
      const available = (data.assets || []).filter(
        (a: AssetRecord) => !existingAssetIds.includes(a.id)
      );
      setAssets(available);
    } catch (err) {
      console.error('Failed to load assets', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelection = (assetId: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const handleAddAssets = async () => {
    if (selectedAssetIds.size === 0) return;
    try {
      setAdding(true);
      const headers = buildAuthHeaders(accessToken);
      headers['Content-Type'] = 'application/json';
      const response = await fetch(`/api/campaigns/${campaignId}/add-assets`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ assetIds: Array.from(selectedAssetIds) }),
      });
      if (!response.ok) throw new Error('Failed to add assets');
      toast.success(`${selectedAssetIds.size} asset${selectedAssetIds.size !== 1 ? 's' : ''} added.`);
      onAssetsAdded();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add assets to campaign.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !adding && onClose()}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>Add assets to campaign</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-3 border-b border-border space-y-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search assets by title, tag, SKU, product…"
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Select
              value={filters.assetType || ALL}
              onValueChange={(v) =>
                setFilters({ ...filters, assetType: v === ALL ? '' : v })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Asset type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="document">Document</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.productLine || ALL}
              onValueChange={(v) =>
                setFilters({ ...filters, productLine: v === ALL ? '' : v })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Product line" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All product lines</SelectItem>
                <SelectItem value="ProCtrl">ProCtrl</SelectItem>
                <SelectItem value="SelfCtrl">SelfCtrl</SelectItem>
                <SelectItem value="Both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading assets…</p>
          ) : assets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No matching assets.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {assets.map((asset) => {
                const selected = selectedAssetIds.has(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => handleToggleSelection(asset.id)}
                    className={`relative text-left rounded-md border overflow-hidden transition-all ${
                      selected
                        ? 'border-brand-periwinkle ring-2 ring-brand-periwinkle/30 bg-brand-periwinkle/5'
                        : 'border-border hover:border-foreground/30'
                    }`}
                  >
                    <div className="aspect-square bg-muted/40 relative">
                      {asset.asset_type === 'video' && asset.vimeo_video_id ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://vumbnail.com/${asset.vimeo_video_id}.jpg`}
                          alt={asset.title}
                          className="h-full w-full object-cover"
                        />
                      ) : asset.current_version?.previewPath && accessToken ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ensureTokenUrl(asset.current_version.previewPath, accessToken)}
                          alt={asset.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-10 w-10" />
                        </div>
                      )}
                      {selected && (
                        <div className="absolute top-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-periwinkle text-white shadow-sm">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium text-foreground truncate">{asset.title}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border flex items-center justify-between sm:justify-between gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {selectedAssetIds.size} {selectedAssetIds.size === 1 ? 'asset' : 'assets'} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={adding}>
              Cancel
            </Button>
            <Button
              onClick={handleAddAssets}
              disabled={selectedAssetIds.size === 0 || adding}
              loading={adding}
            >
              {adding
                ? 'Adding…'
                : `Add ${selectedAssetIds.size || ''} ${
                    selectedAssetIds.size === 1 ? 'asset' : 'assets'
                  }`.trim()}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
