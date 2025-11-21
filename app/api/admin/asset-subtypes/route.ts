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

// GET /api/admin/asset-subtypes - List all asset subtypes with asset counts
export async function GET(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();

    // Fetch all asset subtypes with parent type info
    const { data: subtypes, error: subtypesError } = await supabaseAdmin
      .from('dam_asset_subtypes')
      .select(`
        *,
        asset_type:dam_asset_types(id, name, slug)
      `)
      .order('display_order', { ascending: true });

    if (subtypesError) throw subtypesError;

    // Count assets per subtype
    const { data: assets, error: assetsError } = await supabaseAdmin
      .from('dam_assets')
      .select('asset_subtype_id');

    if (assetsError) throw assetsError;

    // Calculate counts
    const counts: Record<string, number> = {};
    (assets || []).forEach((asset: any) => {
      if (asset.asset_subtype_id) {
        counts[asset.asset_subtype_id] = (counts[asset.asset_subtype_id] || 0) + 1;
      }
    });

    // Merge counts with subtypes
    const result = (subtypes || []).map((subtype: any) => ({
      id: subtype.id,
      name: subtype.name,
      slug: subtype.slug,
      asset_type_id: subtype.asset_type_id,
      asset_type_name: subtype.asset_type?.name || 'Unknown',
      active: subtype.active,
      display_order: subtype.display_order,
      asset_count: counts[subtype.id] || 0,
    }));

    return NextResponse.json({ assetSubtypes: result });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset subtypes fetch failed', err);
    return NextResponse.json({ error: err.message || 'Failed to load asset subtypes' }, { status: 500 });
  }
}

// POST /api/admin/asset-subtypes - Create new asset subtype
export async function POST(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();
    const { name, slug, asset_type_id, active, display_order } = body;

    if (!name || !asset_type_id) {
      return NextResponse.json({ error: 'Name and Asset Type are required' }, { status: 400 });
    }

    const insertData: any = {
      name: name.trim(),
      slug: slug || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      asset_type_id,
      active: active !== undefined ? active : true,
      display_order: display_order || 0,
    };

    const { data, error } = await supabaseAdmin
      .from('dam_asset_subtypes')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'An asset subtype with this slug already exists' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ assetSubtype: data });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset subtype create failed', err);
    return NextResponse.json({ error: err.message || 'Failed to create asset subtype' }, { status: 500 });
  }
}

// PATCH /api/admin/asset-subtypes - Update asset subtype
export async function PATCH(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();
    const { id, name, slug, asset_type_id, active, display_order } = body;

    if (!id) {
      return NextResponse.json({ error: 'Asset subtype ID is required' }, { status: 400 });
    }

    // If changing parent type, check if subtype is in use
    if (asset_type_id !== undefined) {
      const { data: currentSubtype } = await supabaseAdmin
        .from('dam_asset_subtypes')
        .select('asset_type_id')
        .eq('id', id)
        .single();

      if (currentSubtype && currentSubtype.asset_type_id !== asset_type_id) {
        // Check if any assets use this subtype
        const { count } = await supabaseAdmin
          .from('dam_assets')
          .select('*', { count: 'exact', head: true })
          .eq('asset_subtype_id', id);

        if (count && count > 0) {
          return NextResponse.json(
            { error: 'Cannot change parent type: this subtype is in use by assets' },
            { status: 400 }
          );
        }
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (asset_type_id !== undefined) updateData.asset_type_id = asset_type_id;
    if (active !== undefined) updateData.active = active;
    if (display_order !== undefined) updateData.display_order = display_order;

    const { data, error } = await supabaseAdmin
      .from('dam_asset_subtypes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'An asset subtype with this slug already exists' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ assetSubtype: data });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset subtype update failed', err);
    return NextResponse.json({ error: err.message || 'Failed to update asset subtype' }, { status: 500 });
  }
}

// DELETE /api/admin/asset-subtypes/[id] - Delete asset subtype (only if not in use)
export async function DELETE(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Asset subtype ID is required' }, { status: 400 });
    }

    // Check if any assets use this subtype
    const { count, error: countError } = await supabaseAdmin
      .from('dam_assets')
      .select('*', { count: 'exact', head: true })
      .eq('asset_subtype_id', id);

    if (countError) throw countError;

    if (count && count > 0) {
      return NextResponse.json(
        { error: `This asset subtype is in use by ${count} asset(s) and cannot be deleted. Deactivate instead.` },
        { status: 400 }
      );
    }

    // Delete the subtype
    const { error: deleteError } = await supabaseAdmin
      .from('dam_asset_subtypes')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Asset subtype delete failed', err);
    return NextResponse.json({ error: err.message || 'Failed to delete asset subtype' }, { status: 500 });
  }
}

