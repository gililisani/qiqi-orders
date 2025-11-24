'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '../../../../lib/supabase-provider';
import {
  PlusIcon,
  PhotoIcon,
  CalendarIcon,
  TagIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { ensureTokenUrl } from '../../../components/dam/utils';

// Note: We use Supabase directly (like Products/Orders pages) instead of API routes
// RLS policies handle authentication automatically - no need for manual token management

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
  asset_count: number;
  thumbnail_path?: string | null;
}

export default function CampaignsPage() {
  const router = useRouter();
  const { session, supabase } = useSupabase();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true); // Start as true - we're checking session
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    productLine: '',
    startDate: '',
    endDate: '',
  });

  const fetchCampaigns = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      // Fetch campaigns directly - RLS policies ensure only admins can access
      const { data: campaignsData, error: campaignsError } = await supabase
        .from('campaigns')
        .select(`
          id,
          name,
          description,
          thumbnail_asset_id,
          product_line,
          start_date,
          end_date,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false });

      if (campaignsError) {
        console.error('Failed to fetch campaigns:', campaignsError);
        setCampaigns([]);
        setLoading(false);
        return;
      }

      // Fetch asset counts for each campaign
      const campaignIds = (campaignsData || []).map((c: any) => c.id);
      let countsByCampaign: Record<string, number> = {};
      
      if (campaignIds.length > 0) {
        const { data: assetCounts } = await supabase
          .from('campaign_assets')
          .select('campaign_id')
          .in('campaign_id', campaignIds);

        if (assetCounts) {
          countsByCampaign = assetCounts.reduce((acc: Record<string, number>, row: any) => {
            acc[row.campaign_id] = (acc[row.campaign_id] || 0) + 1;
            return acc;
          }, {});
        }
      }

      // Fetch thumbnail paths
      const thumbnailAssetIds = (campaignsData || [])
        .map((c: any) => c.thumbnail_asset_id)
        .filter((id: any): id is string => Boolean(id));

      let thumbnailPaths: Record<string, string | null> = {};
      if (thumbnailAssetIds.length > 0) {
        const { data: versions } = await supabase
          .from('dam_asset_versions')
          .select('asset_id, thumbnail_path')
          .in('asset_id', thumbnailAssetIds)
          .order('version_number', { ascending: false });

        if (versions) {
          const latestVersions = new Map<string, string | null>();
          versions.forEach((v: any) => {
            if (!latestVersions.has(v.asset_id)) {
              latestVersions.set(v.asset_id, v.thumbnail_path);
            }
          });

          campaignsData?.forEach((campaign: any) => {
            if (campaign.thumbnail_asset_id) {
              thumbnailPaths[campaign.id] = latestVersions.get(campaign.thumbnail_asset_id) || null;
            }
          });
        }
      }

      const campaignsWithCounts = (campaignsData || []).map((campaign: any) => ({
        ...campaign,
        asset_count: countsByCampaign[campaign.id] || 0,
        thumbnail_path: thumbnailPaths[campaign.id] || null,
      }));
      setCampaigns(campaignsWithCounts);
    } catch (err: any) {
      console.error('Failed to load campaigns', err);
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Fetch campaigns directly from Supabase - RLS handles authentication automatically
  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleCreateCampaign = async () => {
    if (!newCampaign.name.trim()) {
      alert('Campaign name is required');
      return;
    }

    if (!supabase) {
      alert('Database connection unavailable');
      return;
    }

    try {
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .insert({
          name: newCampaign.name.trim(),
          description: newCampaign.description?.trim() || null,
          product_line: newCampaign.productLine || null,
          start_date: newCampaign.startDate || null,
          end_date: newCampaign.endDate || null,
        })
        .select()
        .single();

      if (error) throw error;

      if (campaign) {
        // Refresh campaigns list and redirect
        router.push(`/admin/dam/campaigns/${campaign.id}`);
      }
    } catch (err: any) {
      console.error('Failed to create campaign', err);
      alert(err.message || 'Failed to create campaign. Check console for details.');
    }
  };

  const handleDeleteCampaign = async () => {
    if (!campaignToDelete || !supabase) {
      return;
    }

    setDeleting(true);

    try {
      // Step 1: Delete campaign_assets first (to avoid foreign key constraints)
      const { error: assetsError } = await supabase
        .from('campaign_assets')
        .delete()
        .eq('campaign_id', campaignToDelete.id);

      if (assetsError) {
        console.error('Failed to delete campaign assets:', assetsError);
        // Continue with campaign deletion even if this fails
      }

      // Step 2: Delete the campaign
      const { error: deleteError } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignToDelete.id);

      if (deleteError) throw deleteError;

      // Step 3: Refresh campaigns list
      setCampaignToDelete(null);
      await fetchCampaigns();
    } catch (err: any) {
      console.error('Failed to delete campaign', err);
      alert(err.message || 'Failed to delete campaign. Check console for details.');
    } finally {
      setDeleting(false);
    }
  };

  const fetchCampaigns = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      // Fetch campaigns directly - RLS policies ensure only admins can access
      const { data: campaignsData, error: campaignsError } = await supabase
        .from('campaigns')
        .select(`
          id,
          name,
          description,
          thumbnail_asset_id,
          product_line,
          start_date,
          end_date,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false });

      if (campaignsError) {
        console.error('Failed to fetch campaigns:', campaignsError);
        setCampaigns([]);
        setLoading(false);
        return;
      }

      // Fetch asset counts for each campaign
      const campaignIds = (campaignsData || []).map((c: any) => c.id);
      let countsByCampaign: Record<string, number> = {};
      
      if (campaignIds.length > 0) {
        const { data: assetCounts } = await supabase
          .from('campaign_assets')
          .select('campaign_id')
          .in('campaign_id', campaignIds);

        if (assetCounts) {
          countsByCampaign = assetCounts.reduce((acc: Record<string, number>, row: any) => {
            acc[row.campaign_id] = (acc[row.campaign_id] || 0) + 1;
            return acc;
          }, {});
        }
      }

      // Fetch thumbnail paths
      const thumbnailAssetIds = (campaignsData || [])
        .map((c: any) => c.thumbnail_asset_id)
        .filter((id: any): id is string => Boolean(id));

      let thumbnailPaths: Record<string, string | null> = {};
      if (thumbnailAssetIds.length > 0) {
        const { data: versions } = await supabase
          .from('dam_asset_versions')
          .select('asset_id, thumbnail_path')
          .in('asset_id', thumbnailAssetIds)
          .order('version_number', { ascending: false });

        if (versions) {
          const latestVersions = new Map<string, string | null>();
          versions.forEach((v: any) => {
            if (!latestVersions.has(v.asset_id)) {
              latestVersions.set(v.asset_id, v.thumbnail_path);
            }
          });

          campaignsData?.forEach((campaign: any) => {
            if (campaign.thumbnail_asset_id) {
              thumbnailPaths[campaign.id] = latestVersions.get(campaign.thumbnail_asset_id) || null;
            }
          });
        }
      }

      const campaignsWithCounts = (campaignsData || []).map((campaign: any) => ({
        ...campaign,
        asset_count: countsByCampaign[campaign.id] || 0,
        thumbnail_path: thumbnailPaths[campaign.id] || null,
      }));
      setCampaigns(campaignsWithCounts);
    } catch (err: any) {
      console.error('Failed to load campaigns', err);
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

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

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading campaigns...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your asset campaigns</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
        >
          <PlusIcon className="h-4 w-4" />
          New Campaign
        </button>
      </div>

      {/* Campaigns Grid */}
      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <TagIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-sm font-medium text-gray-900">No campaigns</h3>
          <p className="mt-2 text-sm text-gray-500">Get started by creating a new campaign.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
          >
            <PlusIcon className="h-4 w-4" />
            New Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              onClick={() => router.push(`/admin/dam/campaigns/${campaign.id}`)}
              className="group cursor-pointer rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-all"
            >
              {/* Thumbnail */}
              <div className="relative h-48 bg-gray-100 overflow-hidden">
                {campaign.thumbnail_path ? (
                  <img
                    src={ensureTokenUrl(campaign.thumbnail_path, session?.access_token ?? null)}
                    alt={campaign.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-400">
                    <PhotoIcon className="h-12 w-12" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex items-center gap-2">
                  <div className="rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white">
                    {campaign.asset_count} {campaign.asset_count === 1 ? 'asset' : 'assets'}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCampaignToDelete(campaign);
                    }}
                    className="rounded-md bg-red-600/90 p-1.5 text-white hover:bg-red-700 transition-colors"
                    title="Delete campaign"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{campaign.name}</h3>
                {campaign.description && (
                  <p className="mt-1 text-xs text-gray-600 line-clamp-2">{campaign.description}</p>
                )}
                
                <div className="mt-3 space-y-1.5">
                  {campaign.product_line && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-gray-500">Product Line:</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                        {campaign.product_line}
                      </span>
                    </div>
                  )}
                  
                  {formatDateRange(campaign.start_date, campaign.end_date) && (
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                      <CalendarIcon className="h-3 w-3" />
                      <span>{formatDateRange(campaign.start_date, campaign.end_date)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {campaignToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              setCampaignToDelete(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Delete Campaign</h2>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete <strong>{campaignToDelete.name}</strong>? This will remove all assets associated with this campaign. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCampaignToDelete(null)}
                disabled={deleting}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCampaign}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCreateModal(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Campaign</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                  placeholder="Enter campaign name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                  placeholder="Enter campaign description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product Line (optional)
                </label>
                <select
                  value={newCampaign.productLine}
                  onChange={(e) => setNewCampaign({ ...newCampaign, productLine: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                >
                  <option value="">None</option>
                  <option value="ProCtrl">ProCtrl</option>
                  <option value="SelfCtrl">SelfCtrl</option>
                  <option value="Both">Both</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date (optional)
                  </label>
                  <input
                    type="date"
                    value={newCampaign.startDate}
                    onChange={(e) => setNewCampaign({ ...newCampaign, startDate: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date (optional)
                  </label>
                  <input
                    type="date"
                    value={newCampaign.endDate}
                    onChange={(e) => setNewCampaign({ ...newCampaign, endDate: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCampaign}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Create Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

