'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSupabase } from '../../../../../lib/supabase-provider';
import {
  PlusIcon,
  TrashIcon,
  PhotoIcon,
  CalendarIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import AssetCard from '../../../../components/dam/AssetCard';
import AssetDetailModal from '../../../../components/dam/AssetDetailModal';
import { AssetRecord, VimeoDownloadFormat } from '../../../../components/dam/types';
import { ensureTokenUrl, buildAuthHeaders, getFileTypeBadge } from '../../../../components/dam/utils';

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
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showAddAssetsModal, setShowAddAssetsModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'compact' | 'comfortable'>('compact');
  const [downloadingFormats, setDownloadingFormats] = useState<Set<string>>(new Set());
  const [assetTypes, setAssetTypes] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [assetSubtypes, setAssetSubtypes] = useState<Array<{ id: string; name: string; slug: string; asset_type_id: string }>>([]);

  const [accessToken, setAccessToken] = useState<string | null>(session?.access_token ?? null);

  // Fallback: Get session from Supabase if not available from provider (same pattern as DAM page)
  useEffect(() => {
    let active = true;
    if (!accessToken && supabase) {
      supabase.auth.getSession().then(({ data }: { data: { session: { access_token: string } | null } }) => {
        if (!active) return;
        setAccessToken(data.session?.access_token ?? null);
      });
    }
    return () => {
      active = false;
    };
  }, [accessToken, supabase]);

  // Update token when session from provider changes
  useEffect(() => {
    if (session?.access_token) {
      setAccessToken(session.access_token);
    }
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
        setAssetTypes(payload.assetTypes || []);
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
        const errorMsg = errorData.error || `Failed to fetch campaign: ${response.status}`;
        setStatus('error');
        setErrorMessage(errorMsg);
        setCampaign(null);
        setAssets([]);
        return;
      }

      const data = await response.json();
      
      if (!data.campaign) {
        setStatus('error');
        setErrorMessage('Campaign data is missing');
        setCampaign(null);
        setAssets([]);
        return;
      }
      
      setCampaign(data.campaign);
      setAssets(data.assets || []);
      setStatus('success');
    } catch (err: any) {
      console.error('Campaign load error', err);
      setStatus('error');
      setErrorMessage(err.message || 'Failed to load campaign');
      setCampaign(null);
      setAssets([]);
    }
  };

  useEffect(() => {
    if (!campaignId) {
      setStatus('error');
      setErrorMessage('Campaign ID is required');
      return;
    }

    // Wait for session to be available before checking accessToken
    if (!session) {
      // Session might still be loading, don't error yet
      return;
    }

    if (!accessToken) {
      setStatus('error');
      setErrorMessage('Authentication required');
      return;
    }

    fetchCampaign();
    fetchLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, session, accessToken]);

  const handleRemoveAsset = async (assetId: string) => {
    if (!window.confirm('Remove this asset from the campaign? Assets will remain in the library.')) {
      return;
    }

    try {
      const headers = buildAuthHeaders(accessToken);
      headers['Content-Type'] = 'application/json';

      const response = await fetch(`/api/campaigns/${campaignId}/remove-asset`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ assetId }),
      });

      if (!response.ok) throw new Error('Failed to remove asset');

      // Remove from local state
      setAssets(assets.filter(a => a.id !== assetId));
    } catch (err) {
      console.error('Failed to remove asset', err);
      alert('Failed to remove asset from campaign');
    }
  };

  const handleDownload = async (asset: AssetRecord, format?: string) => {
    if (!asset.current_version?.downloadPath) return;

    const downloadKey = format ? `video-${asset.id}-${format}` : `asset-action-${asset.id}`;
    setDownloadingFormats(prev => new Set(prev).add(downloadKey));

    try {
      const downloadUrl = ensureTokenUrl(asset.current_version.downloadPath, accessToken);
      const filename = asset.use_title_as_filename && asset.title
        ? `${asset.title}.${asset.current_version.mime_type?.split('/')[1] || 'bin'}`
        : asset.current_version.originalFileName || `${asset.title || 'asset'}.${asset.current_version.mime_type?.split('/')[1] || 'bin'}`;

      // For video formats, use the format URL
      if (format && asset.vimeo_download_formats) {
        const formatObj = asset.vimeo_download_formats.find(f => f.resolution === format);
        if (formatObj?.url) {
          const link = document.createElement('a');
          link.href = formatObj.url;
          link.download = `${asset.title || 'video'}_${format}.mp4`;
          link.click();
          setDownloadingFormats(prev => {
            const next = new Set(prev);
            next.delete(downloadKey);
            return next;
          });
          return;
        }
      }

      // For regular assets, fetch and download
      const response = await fetch(downloadUrl, { headers: buildAuthHeaders(accessToken) });
      if (!response.ok) throw new Error('Download failed');

      let downloadFilename = filename;
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          downloadFilename = filenameMatch[1].replace(/['"]/g, '');
        }
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
    } catch (err) {
      console.error('Download failed', err);
      alert('Failed to download asset');
    } finally {
      setDownloadingFormats(prev => {
        const next = new Set(prev);
        next.delete(downloadKey);
        return next;
      });
    }
  };

  const formatDateRange = (startDate?: string | null, endDate?: string | null) => {
    if (!startDate && !endDate) return null;
    
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    if (startDate && endDate) {
      return `${formatDate(startDate)} – ${formatDate(endDate)}`;
    } else if (startDate) {
      return `From ${formatDate(startDate)}`;
    } else if (endDate) {
      return `Until ${formatDate(endDate)}`;
    }
    return null;
  };

  const renderAssetTypePill = (type: string, size: 'sm' | 'md' = 'md') => {
    const typeMap: Record<string, { label: string; bg: string; text: string }> = {
      image: { label: 'Image', bg: 'bg-blue-100', text: 'text-blue-700' },
      video: { label: 'Video', bg: 'bg-purple-100', text: 'text-purple-700' },
      document: { label: 'Document', bg: 'bg-green-100', text: 'text-green-700' },
      artwork: { label: 'Artwork', bg: 'bg-orange-100', text: 'text-orange-700' },
      audio: { label: 'Audio', bg: 'bg-pink-100', text: 'text-pink-700' },
      font: { label: 'Font', bg: 'bg-gray-100', text: 'text-gray-700' },
      archive: { label: 'Archive', bg: 'bg-yellow-100', text: 'text-yellow-700' },
      other: { label: 'Other', bg: 'bg-gray-100', text: 'text-gray-700' },
    };

    const typeInfo = typeMap[type.toLowerCase()] || typeMap.other;
    const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';

    return (
      <span className={`rounded-md ${typeInfo.bg} ${typeInfo.text} ${sizeClasses} font-medium`}>
        {typeInfo.label}
      </span>
    );
  };

  if (status === 'loading') {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading campaign...</div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-8">
        <div className="text-center text-red-500">{errorMessage || 'Failed to load campaign'}</div>
      </div>
    );
  }

  if (status === 'success' && !campaign) {
    return (
      <div className="p-8">
        <div className="text-center text-red-500">Campaign not found</div>
      </div>
    );
  }

  if (status !== 'success' || !campaign) {
    return null;
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/admin/dam/campaigns')}
          className="mb-4 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Campaigns
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{campaign.name}</h1>
            {campaign.description && (
              <p className="mt-1 text-sm text-gray-600">{campaign.description}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-600">
              {campaign.product_line && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  {campaign.product_line}
                </span>
              )}
              {formatDateRange(campaign.start_date, campaign.end_date) && (
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="h-4 w-4" />
                  <span>{formatDateRange(campaign.start_date, campaign.end_date)}</span>
                </div>
              )}
              <span className="text-gray-500">
                {assets.length} {assets.length === 1 ? 'asset' : 'assets'}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowAddAssetsModal(true)}
            className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
          >
            <PlusIcon className="h-4 w-4" />
            Add Assets to Campaign
          </button>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 p-1">
          <button
            onClick={() => setViewMode('compact')}
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              viewMode === 'compact'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Compact
          </button>
          <button
            onClick={() => setViewMode('comfortable')}
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              viewMode === 'comfortable'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Comfortable
          </button>
        </div>
      </div>

      {/* Assets Grid */}
      {assets.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <PhotoIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-sm font-medium text-gray-900">No assets in this campaign</h3>
          <p className="mt-2 text-sm text-gray-500">Add assets to get started.</p>
          <button
            onClick={() => setShowAddAssetsModal(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
          >
            <PlusIcon className="h-4 w-4" />
            Add Assets
          </button>
        </div>
      ) : (
        <div className={`grid gap-2.5 ${viewMode === 'compact' ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'}`}>
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
              {/* Remove from campaign button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveAsset(asset.id);
                }}
                className="absolute top-2 right-2 z-30 rounded-md bg-red-600/90 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-700"
                title="Remove from campaign"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Asset Detail Modal */}
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

      {/* Add Assets Modal */}
      {showAddAssetsModal && (
        <AddAssetsModal
          campaignId={campaignId}
          existingAssetIds={assets.map(a => a.id)}
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

// Add Assets Modal Component
interface AddAssetsModalProps {
  campaignId: string;
  existingAssetIds: string[];
  onClose: () => void;
  onAssetsAdded: () => void;
  accessToken: string | null;
}

function AddAssetsModal({ campaignId, existingAssetIds, onClose, onAssetsAdded, accessToken }: AddAssetsModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [filters, setFilters] = useState({
    assetType: '',
    locale: '',
    region: '',
    tag: '',
    productLine: '',
  });

  useEffect(() => {
    fetchAssets();
  }, [searchTerm, filters]);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const headers = buildAuthHeaders(accessToken);
      const params = new URLSearchParams();
      if (searchTerm) params.set('q', searchTerm);
      if (filters.assetType) params.set('assetType', filters.assetType);
      if (filters.locale) params.set('locale', filters.locale);
      if (filters.region) params.set('region', filters.region);
      if (filters.tag) params.set('tag', filters.tag);
      if (filters.productLine) params.set('productLine', filters.productLine);
      params.set('limit', '100');

      const response = await fetch(`/api/dam/assets?${params.toString()}`, { headers });
      if (!response.ok) throw new Error('Failed to fetch assets');

      const data = await response.json();
      // Filter out assets already in campaign
      const availableAssets = (data.assets || []).filter((a: AssetRecord) => !existingAssetIds.includes(a.id));
      setAssets(availableAssets);
    } catch (err) {
      console.error('Failed to load assets', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelection = (assetId: string) => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const handleAddAssets = async () => {
    if (selectedAssetIds.size === 0) {
      alert('Please select at least one asset');
      return;
    }

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

      onAssetsAdded();
    } catch (err) {
      console.error('Failed to add assets', err);
      alert('Failed to add assets to campaign');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-6xl max-h-[90vh] rounded-lg bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Add Assets to Campaign</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search and Filters */}
        <div className="border-b border-gray-200 px-6 py-4 space-y-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search assets by title, tag, SKU, product…"
            className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <select
              value={filters.assetType}
              onChange={(e) => setFilters({ ...filters, assetType: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            >
              <option value="">All Types</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="document">Document</option>
            </select>
            <select
              value={filters.locale}
              onChange={(e) => setFilters({ ...filters, locale: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            >
              <option value="">All Locales</option>
            </select>
            <select
              value={filters.region}
              onChange={(e) => setFilters({ ...filters, region: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            >
              <option value="">All Regions</option>
            </select>
            <select
              value={filters.tag}
              onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            >
              <option value="">All Tags</option>
            </select>
            <select
              value={filters.productLine}
              onChange={(e) => setFilters({ ...filters, productLine: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            >
              <option value="">All Product Lines</option>
              <option value="ProCtrl">ProCtrl</option>
              <option value="SelfCtrl">SelfCtrl</option>
              <option value="Both">Both</option>
            </select>
          </div>
        </div>

        {/* Assets Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center text-gray-500 py-8">Loading assets...</div>
          ) : assets.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No assets found</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => handleToggleSelection(asset.id)}
                  className={`relative cursor-pointer rounded-lg border-2 overflow-hidden transition ${
                    selectedAssetIds.has(asset.id)
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="aspect-square bg-gray-100 relative">
                    {asset.asset_type === 'video' && asset.vimeo_video_id ? (
                      <img
                        src={`https://vumbnail.com/${asset.vimeo_video_id}.jpg`}
                        alt={asset.title}
                        className="h-full w-full object-cover"
                      />
                    ) : asset.current_version?.previewPath && accessToken ? (
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
                    {selectedAssetIds.has(asset.id) && (
                      <div className="absolute top-2 right-2 rounded-full bg-blue-600 p-1">
                        <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-gray-900 truncate">{asset.title}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between">
          <span className="text-sm text-gray-600">
            {selectedAssetIds.size} {selectedAssetIds.size === 1 ? 'asset' : 'assets'} selected
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddAssets}
              disabled={selectedAssetIds.size === 0 || adding}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? 'Adding...' : `Add ${selectedAssetIds.size} Asset${selectedAssetIds.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

