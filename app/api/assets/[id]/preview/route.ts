import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createStorage } from '../../../../../platform/storage';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function createSupabaseAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function ensureAdmin(request: NextRequest) {
  const tokenFromHeader = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  const tokenFromQuery = request.nextUrl.searchParams.get('token');
  const accessToken = tokenFromHeader || tokenFromQuery;

  if (!accessToken) {
    throw NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const adminClient = createSupabaseAdminClient();
  const { data: adminRow, error: adminError } = await adminClient
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .eq('enabled', true)
    .maybeSingle();

  if (adminError || !adminRow) {
    throw NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  return adminClient;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabaseAdmin = await ensureAdmin(request);

    const versionId = request.nextUrl.searchParams.get('version');
    const rendition = request.nextUrl.searchParams.get('rendition');
    if (!versionId) {
      return NextResponse.json({ error: 'Missing version parameter' }, { status: 400 });
    }

    // Fetch version without embed to avoid relationship ambiguity
    const { data: version, error: versionError } = await supabaseAdmin
      .from('dam_asset_versions')
      .select('*')
      .eq('id', versionId)
      .maybeSingle();

    if (versionError) {
      console.error('Version fetch error:', versionError);
      throw versionError;
    }
    if (!version) {
      return NextResponse.json({ error: 'Asset version not found' }, { status: 404 });
    }

    // Fetch asset separately to avoid relationship ambiguity
    const { data: asset, error: assetError } = await supabaseAdmin
      .from('dam_assets')
      .select('id, is_archived')
      .eq('id', version.asset_id)
      .maybeSingle();

    if (assetError) {
      console.error('Asset fetch error:', assetError);
      throw assetError;
    }
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    if (asset.id !== params.id) {
      return NextResponse.json({ error: 'Asset mismatch' }, { status: 404 });
    }

    if (asset.is_archived) {
      return NextResponse.json({ error: 'Asset archived' }, { status: 410 });
    }

    let targetPath: string | null = version.storage_path;
    if (rendition === 'thumbnail' && version.thumbnail_path) {
      targetPath = version.thumbnail_path;
    }

    if (!targetPath) {
      return NextResponse.json({ error: 'Rendition unavailable' }, { status: 404 });
    }

    const storage = createStorage();
    
    try {
      // Generate signed URL WITHOUT downloadName to allow preview instead of download
      const signedUrl = await storage.getSignedUrl(targetPath, {
        expiresIn: 5 * 60,
        // No downloadName parameter - this allows browser to preview instead of download
      });
      return NextResponse.redirect(signedUrl, { status: 302 });
    } catch (storageError: any) {
      console.error('Storage error:', storageError);
      console.error('Target path:', targetPath);
      console.error('Version:', JSON.stringify(version, null, 2));
      throw new Error(`Failed to generate signed URL: ${storageError.message}`);
    }
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Preview route error', err);
    return NextResponse.json({ error: err.message || 'Failed to generate preview link' }, { status: 500 });
  }
}

