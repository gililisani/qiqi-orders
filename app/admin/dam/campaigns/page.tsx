'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '../../../../lib/supabase-provider';
import {
  PlusIcon,
  PhotoIcon,
  CalendarIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import { ensureTokenUrl } from '../../../components/dam/utils';

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
  const [loading, setLoading] = useState(false); // Start as false, only set true when actually fetching
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    productLine: '',
    startDate: '',
    endDate: '',
  });

  const [accessToken, setAccessToken] = useState<string | null>(session?.access_token ?? null);

  // Get session from Supabase if not available from provider (same pattern as DAM page)
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

  // Fetch campaigns when we have a token
  useEffect(() => {
    if (!accessToken) {
      // No token available, stop loading
      setLoading(false);
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 10000); // 10 second timeout

    const fetchCampaigns = async () => {
      try {
        setLoading(true);
        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
        };

        const response = await fetch('/api/campaigns', { 
          headers,
          signal: abortController.signal
        });
        
        clearTimeout(timeoutId);
        
        if (cancelled) return;
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Failed to fetch campaigns: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        if (!cancelled) {
          setCampaigns(data.campaigns || []);
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (!cancelled) {
          if (err.name === 'AbortError') {
            console.error('Request timed out after 10 seconds');
          } else {
            console.error('Failed to load campaigns', err);
          }
          setCampaigns([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchCampaigns();
    
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [accessToken]);

  const handleCreateCampaign = async () => {
    if (!newCampaign.name.trim()) {
      alert('Campaign name is required');
      return;
    }

    if (!accessToken) {
      alert('You must be logged in to create a campaign');
      return;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      };

      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newCampaign.name,
          description: newCampaign.description || null,
          productLine: newCampaign.productLine || null,
          startDate: newCampaign.startDate || null,
          endDate: newCampaign.endDate || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Campaign creation error:', errorData);
        throw new Error(errorData.error || errorData.message || 'Failed to create campaign');
      }

      const data = await response.json();
      // Refresh campaigns list before redirecting (use the state directly to avoid dependency issues)
      setCampaigns(prev => [...prev, data.campaign]);
      router.push(`/admin/dam/campaigns/${data.campaign.id}`);
    } catch (err: any) {
      console.error('Failed to create campaign', err);
      alert(err.message || 'Failed to create campaign. Check console for details.');
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
                {campaign.thumbnail_path && accessToken ? (
                  <img
                    src={ensureTokenUrl(campaign.thumbnail_path, accessToken)}
                    alt={campaign.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-400">
                    <PhotoIcon className="h-12 w-12" />
                  </div>
                )}
                <div className="absolute top-2 right-2 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white">
                  {campaign.asset_count} {campaign.asset_count === 1 ? 'asset' : 'assets'}
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

