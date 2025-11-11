import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAuth } from '../../../../platform/auth';

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

export async function GET(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();

    const [tagsRes, audiencesRes, localesRes, regionsRes] = await Promise.all([
      supabaseAdmin.from('dam_tags').select('*').order('label', { ascending: true }),
      supabaseAdmin.from('dam_audiences').select('*').order('label', { ascending: true }),
      supabaseAdmin.from('dam_locales').select('*').order('label', { ascending: true }),
      supabaseAdmin.from('dam_regions').select('*').order('label', { ascending: true }),
    ]);

    if (tagsRes.error) throw tagsRes.error;
    if (audiencesRes.error) throw audiencesRes.error;
    if (localesRes.error) throw localesRes.error;
    if (regionsRes.error) throw regionsRes.error;

    return NextResponse.json({
      tags: (tagsRes.data ?? []).map((tag) => ({ id: tag.id, slug: tag.slug, label: tag.label })),
      audiences: (audiencesRes.data ?? []).map((aud) => ({ id: aud.id, code: aud.code, label: aud.label })),
      locales: (localesRes.data ?? []).map((locale) => ({
        code: locale.code,
        label: locale.label,
        is_default: locale.is_default,
      })),
      regions: (regionsRes.data ?? []).map((region) => ({ code: region.code, label: region.label })),
    });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Lookup fetch failed', err);
    return NextResponse.json({ error: err.message || 'Failed to load lookups' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();

    if (body?.action === 'add-tag') {
      const label: string = body.label;
      if (!label || typeof label !== 'string') {
        return NextResponse.json({ error: 'Invalid tag label' }, { status: 400 });
      }

      const slug = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const { error: upsertError } = await supabaseAdmin
        .from('dam_tags')
        .upsert({ slug, label: label.trim() });

      if (upsertError) {
        throw upsertError;
      }

      const { data: tagsData, error: tagsError } = await supabaseAdmin
        .from('dam_tags')
        .select('*')
        .order('label', { ascending: true });

      if (tagsError) throw tagsError;

      return NextResponse.json({
        slug,
        tags: (tagsData ?? []).map((tag) => ({ id: tag.id, slug: tag.slug, label: tag.label })),
      });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Lookup mutation failed', err);
    return NextResponse.json({ error: err.message || 'Lookup mutation failed' }, { status: 500 });
  }
}
