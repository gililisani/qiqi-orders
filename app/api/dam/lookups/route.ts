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
    const user = await auth.getUserFromRequest(request);
    // Allow both admins and clients to access lookups
    if (!user || (!user.roles.includes('admin') && !user.roles.includes('client'))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const supabaseAdmin = createSupabaseAdminClient();

    const [tagsRes, localesRes, regionsRes, assetTypesRes, assetSubtypesRes, productsRes] = await Promise.all([
      supabaseAdmin.from('dam_tags').select('*').order('label', { ascending: true }),
      supabaseAdmin.from('dam_locales').select('*').order('label', { ascending: true }),
      supabaseAdmin.from('dam_regions').select('*').order('label', { ascending: true }),
      supabaseAdmin.from('dam_asset_types').select('*').eq('active', true).order('display_order', { ascending: true }),
      supabaseAdmin.from('dam_asset_subtypes').select('*').eq('active', true).order('display_order', { ascending: true }),
      supabaseAdmin.from('Products').select('id, item_name, sku').eq('enable', true).order('item_name', { ascending: true }),
    ]);

    if (tagsRes.error) throw tagsRes.error;
    if (localesRes.error) throw localesRes.error;
    if (regionsRes.error) throw regionsRes.error;
    if (assetTypesRes.error) throw assetTypesRes.error;
    if (assetSubtypesRes.error) throw assetSubtypesRes.error;
    if (productsRes.error) throw productsRes.error;

    return NextResponse.json({
      tags: (tagsRes.data ?? []).map((tag) => ({ id: tag.id, slug: tag.slug, label: tag.label })),
      locales: (localesRes.data ?? []).map((locale) => ({
        code: locale.code,
        label: locale.label,
        is_default: locale.is_default,
      })),
      regions: (regionsRes.data ?? []).map((region) => ({ code: region.code, label: region.label })),
      assetTypes: (assetTypesRes.data ?? []).map((type) => ({
        id: type.id,
        name: type.name,
        slug: type.slug,
        display_order: type.display_order,
      })),
      assetSubtypes: (assetSubtypesRes.data ?? []).map((subtype) => ({
        id: subtype.id,
        name: subtype.name,
        slug: subtype.slug,
        asset_type_id: subtype.asset_type_id,
        display_order: subtype.display_order,
      })),
      products: (productsRes.data ?? []).map((product) => ({
        id: product.id,
        item_name: product.item_name,
        sku: product.sku || '',
      })),
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

      // Check if tag already exists
      const { data: existingTag, error: checkError } = await supabaseAdmin
        .from('dam_tags')
        .select('id, slug, label')
        .eq('slug', slug)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 is "not found" which is fine, other errors are not
        throw checkError;
      }

      // If tag exists, use it; otherwise insert new one
      if (!existingTag) {
        const { error: insertError } = await supabaseAdmin
          .from('dam_tags')
          .insert({ slug, label: label.trim() });

        if (insertError) {
          // If insert fails due to duplicate (race condition), fetch the existing tag
          if (insertError.code === '23505') {
            const { data: fetchedTag } = await supabaseAdmin
              .from('dam_tags')
              .select('id, slug, label')
              .eq('slug', slug)
              .single();
            if (!fetchedTag) {
              throw insertError;
            }
          } else {
            throw insertError;
          }
        }
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

    if (body?.action === 'add-locale') {
      const code: string = body.code;
      const label: string = body.label;
      if (!code || !label || typeof code !== 'string' || typeof label !== 'string') {
        return NextResponse.json({ error: 'Invalid locale code or label' }, { status: 400 });
      }

      const { error: insertError } = await supabaseAdmin
        .from('dam_locales')
        .insert({ code: code.trim().toLowerCase(), label: label.trim(), is_default: false });

      if (insertError) {
        throw insertError;
      }

      const { data: localesData, error: localesError } = await supabaseAdmin
        .from('dam_locales')
        .select('*')
        .order('label', { ascending: true });

      if (localesError) throw localesError;

      return NextResponse.json({
        locales: (localesData ?? []).map((locale) => ({
          code: locale.code,
          label: locale.label,
          is_default: locale.is_default,
        })),
      });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Lookup mutation failed', err);
    return NextResponse.json({ error: err.message || 'Lookup mutation failed' }, { status: 500 });
  }
}
