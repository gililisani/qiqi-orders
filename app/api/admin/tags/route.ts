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

// GET /api/admin/tags - List all tags with asset counts
export async function GET(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';

    // Build query
    let query = supabaseAdmin
      .from('dam_tags')
      .select('*')
      .order('label', { ascending: true });

    // Apply search filter if provided
    if (search) {
      query = query.or(`label.ilike.%${search}%,slug.ilike.%${search}%`);
    }

    const { data: tags, error: tagsError } = await query;

    if (tagsError) throw tagsError;

    // Count assets per tag via dam_asset_tag_map
    const { data: tagMaps, error: mapError } = await supabaseAdmin
      .from('dam_asset_tag_map')
      .select('tag_id');

    if (mapError) throw mapError;

    // Calculate counts
    const counts: Record<string, number> = {};
    (tagMaps || []).forEach((map: any) => {
      if (map.tag_id) {
        counts[map.tag_id] = (counts[map.tag_id] || 0) + 1;
      }
    });

    // Merge counts with tags
    const result = (tags || []).map((tag: any) => ({
      id: tag.id,
      slug: tag.slug,
      label: tag.label,
      asset_count: counts[tag.id] || 0,
    }));

    return NextResponse.json({ tags: result });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Tags fetch failed', err);
    return NextResponse.json({ error: err.message || 'Failed to load tags' }, { status: 500 });
  }
}

// PATCH /api/admin/tags - Update tag (rename)
export async function PATCH(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();
    const { id, label } = body;

    if (!id || !label) {
      return NextResponse.json({ error: 'Tag ID and label are required' }, { status: 400 });
    }

    // Generate new slug from label
    const slug = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if slug already exists for another tag
    const { data: existingTag, error: checkError } = await supabaseAdmin
      .from('dam_tags')
      .select('id')
      .eq('slug', slug)
      .neq('id', id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existingTag) {
      return NextResponse.json({ error: 'A tag with this slug already exists' }, { status: 400 });
    }

    // Update tag
    const { data, error } = await supabaseAdmin
      .from('dam_tags')
      .update({ label: label.trim(), slug })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ tag: data });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Tag update failed', err);
    return NextResponse.json({ error: err.message || 'Failed to update tag' }, { status: 500 });
  }
}

// DELETE /api/admin/tags - Delete tag (removes from all assets)
export async function DELETE(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Tag ID is required' }, { status: 400 });
    }

    // Count assets using this tag
    const { count, error: countError } = await supabaseAdmin
      .from('dam_asset_tag_map')
      .select('*', { count: 'exact', head: true })
      .eq('tag_id', id);

    if (countError) throw countError;

    // Delete all tag mappings first
    const { error: deleteMapError } = await supabaseAdmin
      .from('dam_asset_tag_map')
      .delete()
      .eq('tag_id', id);

    if (deleteMapError) throw deleteMapError;

    // Then delete the tag
    const { error: deleteTagError } = await supabaseAdmin
      .from('dam_tags')
      .delete()
      .eq('id', id);

    if (deleteTagError) throw deleteTagError;

    return NextResponse.json({ 
      success: true, 
      message: count ? `Tag removed from ${count} asset(s) and deleted` : 'Tag deleted' 
    });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Tag delete failed', err);
    return NextResponse.json({ error: err.message || 'Failed to delete tag' }, { status: 500 });
  }
}

