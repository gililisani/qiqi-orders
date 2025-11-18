import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAuth } from '../../../platform/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function createSupabaseAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// GET /api/campaigns - List all campaigns
export async function GET(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();

    // Fetch campaigns with asset counts
    const { data: campaigns, error: campaignsError } = await supabaseAdmin
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

    if (campaignsError) throw campaignsError;

    // Fetch asset counts for each campaign
    const { data: assetCounts, error: countsError } = await supabaseAdmin
      .from('campaign_assets')
      .select('campaign_id')
      .in('campaign_id', (campaigns || []).map(c => c.id));

    if (countsError) throw countsError;

    // Count assets per campaign
    const countsByCampaign = (assetCounts || []).reduce((acc: Record<string, number>, row) => {
      acc[row.campaign_id] = (acc[row.campaign_id] || 0) + 1;
      return acc;
    }, {});

    // Fetch thumbnail paths for campaigns that have thumbnail_asset_id
    const thumbnailAssetIds = (campaigns || [])
      .map(c => c.thumbnail_asset_id)
      .filter((id): id is string => Boolean(id));

    let thumbnailPaths: Record<string, string | null> = {};
    if (thumbnailAssetIds.length > 0) {
      const { data: versions, error: versionsError } = await supabaseAdmin
        .from('dam_asset_versions')
        .select('asset_id, thumbnail_path')
        .in('asset_id', thumbnailAssetIds)
        .order('version_number', { ascending: false });

      if (!versionsError && versions) {
        // Get latest version for each asset
        const latestVersions = new Map<string, string | null>();
        versions.forEach(v => {
          if (!latestVersions.has(v.asset_id)) {
            latestVersions.set(v.asset_id, v.thumbnail_path);
          }
        });

        // Map thumbnail paths to campaign thumbnail_asset_id
        campaigns?.forEach(campaign => {
          if (campaign.thumbnail_asset_id) {
            thumbnailPaths[campaign.id] = latestVersions.get(campaign.thumbnail_asset_id) || null;
          }
        });
      }
    }

    const campaignsWithCounts = (campaigns || []).map(campaign => ({
      ...campaign,
      asset_count: countsByCampaign[campaign.id] || 0,
      thumbnail_path: thumbnailPaths[campaign.id] || null,
    }));

    return NextResponse.json({ campaigns: campaignsWithCounts });
  } catch (err: any) {
    console.error('Campaigns fetch failed', err);
    return NextResponse.json({ error: err.message || 'Failed to load campaigns' }, { status: 500 });
  }
}

// POST /api/campaigns - Create a new campaign
export async function POST(request: NextRequest) {
  try {
    const auth = createAuth();
    const adminUser = await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
    }

    const { data: campaign, error: insertError } = await supabaseAdmin
      .from('campaigns')
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        thumbnail_asset_id: body.thumbnailAssetId || null,
        product_line: body.productLine || null,
        start_date: body.startDate || null,
        end_date: body.endDate || null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err: any) {
    console.error('Campaign creation failed', err);
    return NextResponse.json({ error: err.message || 'Failed to create campaign' }, { status: 500 });
  }
}

