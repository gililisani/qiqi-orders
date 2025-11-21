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

// GET /api/admin/asset-types - List all asset types with asset counts
export async function GET(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();

    // Fetch all asset types
    const { data: assetTypes, error: typesError } = await supabaseAdmin
      .from('dam_asset_types')
      .select('*')
      .order('display_order', { ascending: true });

    if (typesError) throw typesError;

    // Count assets per asset type
    const { data: assets, error: assetsError } = await supabaseAdmin
      .from('dam_assets')
      .select('asset_type_id');

    if (assetsError) throw assetsError;

    // Calculate counts
    const counts: Record<string, number> = {};
    (assets || []).forEach((asset: any) => {
      if (asset.asset_type_id) {
        counts[asset.asset_type_id] = (counts[asset.asset_type_id] || 0) + 1;
      }
    });

    // Merge counts with asset types
    const result = (assetTypes || []).map((type: any) => ({
      id: type.id,
      name: type.name,
      slug: type.slug,
      active: type.active,
      display_order: type.display_order,
      asset_count: counts[type.id] || 0,
    }));

    return NextResponse.json({ assetTypes: result });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset types fetch failed', err);
    return NextResponse.json({ error: err.message || 'Failed to load asset types' }, { status: 500 });
  }
}

// PATCH /api/admin/asset-types - Update asset type
export async function PATCH(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();
    const { id, name, slug, active, display_order } = body;

    if (!id) {
      return NextResponse.json({ error: 'Asset type ID is required' }, { status: 400 });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (active !== undefined) updateData.active = active;
    if (display_order !== undefined) updateData.display_order = display_order;

    const { data, error } = await supabaseAdmin
      .from('dam_asset_types')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // Check for unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json({ error: 'An asset type with this slug already exists' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ assetType: data });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset type update failed', err);
    return NextResponse.json({ error: err.message || 'Failed to update asset type' }, { status: 500 });
  }
}

// POST /api/admin/asset-types - Create new asset type
export async function POST(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();
    const { name, slug, active } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Asset type name is required' }, { status: 400 });
    }

    // Generate slug from name if not provided
    const finalSlug = slug || name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if asset type with this slug already exists
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('dam_asset_types')
      .select('id, slug')
      .eq('slug', finalSlug)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existing) {
      return NextResponse.json({ error: 'An asset type with this slug already exists' }, { status: 400 });
    }

    // Get max display_order
    const { data: maxOrderData } = await supabaseAdmin
      .from('dam_asset_types')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    const insertData: any = {
      name: name.trim(),
      slug: finalSlug,
      active: active !== undefined ? active : true,
      display_order: maxOrderData?.display_order ? maxOrderData.display_order + 1 : 0,
    };

    const { data, error } = await supabaseAdmin
      .from('dam_asset_types')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'An asset type with this slug already exists' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ assetType: data });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset type create failed', err);
    return NextResponse.json({ error: err.message || 'Failed to create asset type' }, { status: 500 });
  }
}

// DELETE /api/admin/asset-types - Delete asset type (only if not in use)
export async function DELETE(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Asset type ID is required' }, { status: 400 });
    }

    // Check if any assets use this asset type
    const { count, error: countError } = await supabaseAdmin
      .from('dam_assets')
      .select('*', { count: 'exact', head: true })
      .eq('asset_type_id', id);

    if (countError) throw countError;

    if (count && count > 0) {
      return NextResponse.json(
        { error: `This asset type is in use by ${count} asset(s) and cannot be deleted. Deactivate instead.` },
        { status: 400 }
      );
    }

    // Delete the asset type
    const { error: deleteError } = await supabaseAdmin
      .from('dam_asset_types')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset type delete failed', err);
    return NextResponse.json({ error: err.message || 'Failed to delete asset type' }, { status: 500 });
  }
}

