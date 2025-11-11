import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createStorage } from '../../../../../platform/storage';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function requireAdmin(authHeader: string | null) {
  if (!authHeader) {
    throw NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseAnon.auth.getUser();

  if (userError || !user) {
    throw NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: adminRow, error: adminError } = await supabaseAnon
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .eq('enabled', true)
    .maybeSingle();

  if (adminError || !adminRow) {
    throw NextResponse.json({ error: 'Not authorized - admin access required' }, { status: 403 });
  }

  return user;
}

function createSupabaseAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(request.headers.get('authorization'));

    const versionId = request.nextUrl.searchParams.get('version');
    const rendition = request.nextUrl.searchParams.get('rendition');
    if (!versionId) {
      return NextResponse.json({ error: 'Missing version parameter' }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: version, error: versionError } = await supabaseAdmin
      .from('dam_asset_versions')
      .select(
        `
          *,
          asset:dam_assets(id, is_archived)
        `
      )
      .eq('id', versionId)
      .maybeSingle();

    if (versionError) throw versionError;
    if (!version || !version.asset) {
      return NextResponse.json({ error: 'Asset version not found' }, { status: 404 });
    }

    if (version.asset.id !== params.id) {
      return NextResponse.json({ error: 'Asset mismatch' }, { status: 404 });
    }

    if (version.asset.is_archived) {
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
    const metadata = (version.metadata ?? {}) as Record<string, any>;
    const downloadName = typeof metadata.originalFileName === 'string' ? metadata.originalFileName : undefined;
    const signedUrl = await storage.getSignedUrl(targetPath, {
      expiresIn: 5 * 60,
      downloadName,
    });

    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Download route error', err);
    return NextResponse.json({ error: err.message || 'Failed to generate download link' }, { status: 500 });
  }
}
