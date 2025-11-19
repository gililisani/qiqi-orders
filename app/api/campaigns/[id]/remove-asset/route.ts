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
    db: {
      schema: 'public',
    },
  });
}

// POST /api/campaigns/[id]/remove-asset - Remove an asset from campaign
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();

    if (!body.assetId) {
      return NextResponse.json({ error: 'assetId is required' }, { status: 400 });
    }

    // Delete the campaign_assets row (this does NOT delete the asset itself)
    const { error: deleteError } = await supabaseAdmin
      .from('campaign_assets')
      .delete()
      .eq('campaign_id', params.id)
      .eq('asset_id', body.assetId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Remove asset from campaign failed', err);
    return NextResponse.json({ error: err.message || 'Failed to remove asset from campaign' }, { status: 500 });
  }
}

