import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAuth } from '../../../../../platform/auth';

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

// POST /api/campaigns/[id]/add-assets - Add assets to campaign
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();

    if (!body.assetIds || !Array.isArray(body.assetIds) || body.assetIds.length === 0) {
      return NextResponse.json({ error: 'assetIds array is required' }, { status: 400 });
    }

    // Verify campaign exists
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .select('id')
      .eq('id', params.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Check which assets are already in the campaign
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('campaign_assets')
      .select('asset_id')
      .eq('campaign_id', params.id)
      .in('asset_id', body.assetIds);

    if (existingError) throw existingError;

    const existingAssetIds = new Set((existing || []).map(e => e.asset_id));
    const newAssetIds = body.assetIds.filter((id: string) => !existingAssetIds.has(id));

    if (newAssetIds.length === 0) {
      return NextResponse.json({ message: 'All assets are already in the campaign', added: 0 });
    }

    // Insert new campaign_assets rows
    const campaignAssets = newAssetIds.map((assetId: string) => ({
      campaign_id: params.id,
      asset_id: assetId,
    }));

    const { error: insertError } = await supabaseAdmin
      .from('campaign_assets')
      .insert(campaignAssets);

    if (insertError) throw insertError;

    return NextResponse.json({ 
      success: true, 
      added: newAssetIds.length,
      skipped: body.assetIds.length - newAssetIds.length,
    });
  } catch (err: any) {
    console.error('Add assets to campaign failed', err);
    return NextResponse.json({ error: err.message || 'Failed to add assets to campaign' }, { status: 500 });
  }
}

