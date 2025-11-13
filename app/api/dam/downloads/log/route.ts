import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAuth } from '../../../../../platform/auth';
import { randomUUID } from 'crypto';

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

export async function POST(request: NextRequest) {
  try {
    const auth = createAuth();
    // Allow authenticated users (not just admins) to log downloads
    const user = await auth.getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();

    if (!body.assetId || !body.downloadUrl || !body.downloadMethod) {
      return NextResponse.json(
        { error: 'Missing required fields: assetId, downloadUrl, downloadMethod' },
        { status: 400 }
      );
    }

    // Get user agent and IP from request headers
    const userAgent = request.headers.get('user-agent') || null;
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : request.headers.get('x-real-ip') || null;

    // Create download event record
    const { error: insertError } = await supabaseAdmin.from('dam_download_events').insert({
      id: randomUUID(),
      asset_id: body.assetId,
      version_id: body.versionId || null,
      rendition_id: body.renditionId || null,
      downloaded_by: user.id,
      download_method: body.downloadMethod,
      user_agent: userAgent,
      ip_address: ipAddress,
    });

    if (insertError) {
      console.error('Failed to log download event:', insertError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Download logging failed', err);
    return NextResponse.json({ error: err.message || 'Failed to log download' }, { status: 500 });
  }
}

