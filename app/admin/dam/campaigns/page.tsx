'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Image as ImageIcon,
  Calendar,
  Tag,
  Trash2,
} from 'lucide-react';

import { useSupabase } from '../../../../lib/supabase-provider';
import { ensureTokenUrl } from '../../../components/dam/utils';

import { PageHeader } from '../../../components/qq/page-header';
import { Card } from '../../../components/qq/card';
import { Button } from '../../../components/qq/button';
import { Input } from '../../../components/qq/input';
import { Label } from '../../../components/qq/label';
import { Badge } from '../../../components/qq/badge';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { EmptyState } from '../../../components/qq/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/qq/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../components/qq/dialog';
import { useToast } from '../../../components/ui/ToastProvider';
import { useConfirm } from '../../../components/ui/ConfirmProvider';

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

const PRODUCT_LINE_NONE = '__none__';

export default function CampaignsPage() {
  const router = useRouter();
  const { session, supabase } = useSupabase();
  const toast = useToast();
  const confirm = useConfirm();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
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
      const { data: campaignsData, error: campaignsError } = await supabase
        .from('campaigns')
        .select(`id, name, description, thumbnail_asset_id, product_line, start_date, end_date, created_at, updated_at`)
        .order('created_at', { ascending: false });
      if (campaignsError) throw campaignsError;

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
          (campaignsData || []).forEach((campaign: any) => {
            if (campaign.thumbnail_asset_id) {
              thumbnailPaths[campaign.id] =
                latestVersions.get(campaign.thumbnail_asset_id) || null;
            }
          });
        }
      }

      setCampaigns(
        (campaignsData || []).map((campaign: any) => ({
          ...campaign,
          asset_count: countsByCampaign[campaign.id] || 0,
          thumbnail_path: thumbnailPaths[campaign.id] || null,
        }))
      );
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns.');
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleCreateCampaign = async () => {
    if (!newCampaign.name.trim()) {
      toast.error('Campaign name is required.');
      return;
    }
    if (!supabase) {
      toast.error('Database connection unavailable.');
      return;
    }
    setCreating(true);
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
        toast.success('Campaign created.');
        router.push(`/admin/dam/campaigns/${campaign.id}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create campaign.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCampaign = async (campaign: Campaign) => {
    const ok = await confirm({
      title: 'Delete campaign?',
      description: `Permanently delete "${campaign.name}". This removes the campaign and its asset associations (assets stay in the library). Cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete campaign',
      requireExplicitConfirm: true,
    });
    if (!ok) return;
    try {
      if (!supabase) throw new Error('Database connection unavailable.');
      await supabase.from('campaign_assets').delete().eq('campaign_id', campaign.id);
      const { error } = await supabase.from('campaigns').delete().eq('id', campaign.id);
      if (error) throw error;
      toast.success('Campaign deleted.');
      await fetchCampaigns();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete campaign.');
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

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading campaigns…</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-4">
      <PageHeader
        title="Campaigns"
        description="Group assets into themed campaigns."
        actions={
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" /> New campaign
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Tag />}
            title="No campaigns yet"
            description="Create a campaign to start grouping related assets."
            action={
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4" /> New campaign
              </Button>
            }
            className="border-0 shadow-none"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {campaigns.map((campaign) => (
            <Card
              key={campaign.id}
              onClick={() => router.push(`/admin/dam/campaigns/${campaign.id}`)}
              className="group cursor-pointer overflow-hidden hover:border-foreground/30 hover:shadow-sm transition-all"
            >
              {/* Thumbnail */}
              <div className="relative h-44 bg-muted/40 overflow-hidden">
                {campaign.thumbnail_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ensureTokenUrl(campaign.thumbnail_path, session?.access_token ?? null)}
                    alt={campaign.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-10 w-10" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex items-center gap-1.5">
                  <span className="rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
                    {campaign.asset_count} {campaign.asset_count === 1 ? 'asset' : 'assets'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCampaign(campaign);
                    }}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/95 hover:bg-background text-destructive shadow-sm transition opacity-0 group-hover:opacity-100"
                    title="Delete campaign"
                    aria-label="Delete campaign"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground truncate">{campaign.name}</h3>
                {campaign.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{campaign.description}</p>
                )}

                <div className="space-y-1.5 pt-1">
                  {campaign.product_line && (
                    <div>
                      <Badge variant="muted" className="text-[10px]">
                        {campaign.product_line}
                      </Badge>
                    </div>
                  )}
                  {formatDateRange(campaign.start_date, campaign.end_date) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDateRange(campaign.start_date, campaign.end_date)}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create campaign dialog */}
      <Dialog open={showCreateModal} onOpenChange={(open) => !creating && setShowCreateModal(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm font-medium">
                Campaign name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={newCampaign.name}
                onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                placeholder="e.g. Spring 2026 launch"
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Description (optional)</Label>
              <textarea
                value={newCampaign.description}
                onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                rows={3}
                placeholder="What is this campaign about?"
                className="mt-1.5 w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 resize-y"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Product line (optional)</Label>
              <div className="mt-1.5">
                <Select
                  value={newCampaign.productLine || PRODUCT_LINE_NONE}
                  onValueChange={(v) =>
                    setNewCampaign({
                      ...newCampaign,
                      productLine: v === PRODUCT_LINE_NONE ? '' : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PRODUCT_LINE_NONE}>None</SelectItem>
                    <SelectItem value="ProCtrl">ProCtrl</SelectItem>
                    <SelectItem value="SelfCtrl">SelfCtrl</SelectItem>
                    <SelectItem value="Both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Start date</Label>
                <Input
                  type="date"
                  value={newCampaign.startDate}
                  onChange={(e) => setNewCampaign({ ...newCampaign, startDate: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">End date</Label>
                <Input
                  type="date"
                  value={newCampaign.endDate}
                  onChange={(e) => setNewCampaign({ ...newCampaign, endDate: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateModal(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateCampaign} loading={creating}>
              Create campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
