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

// GET /api/admin/product-lines - List all product lines with asset counts
export async function GET(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();

    // Fetch all product lines
    const { data: productLines, error: plError } = await supabaseAdmin
      .from('dam_product_lines')
      .select('*')
      .order('display_order', { ascending: true });

    if (plError) throw plError;

    // Count assets per product line
    const { data: assetCounts, error: countError } = await supabaseAdmin
      .from('dam_assets')
      .select('product_line');

    if (countError) throw countError;

    // Calculate counts
    const counts: Record<string, number> = {};
    (assetCounts || []).forEach((asset: any) => {
      if (asset.product_line) {
        counts[asset.product_line] = (counts[asset.product_line] || 0) + 1;
      }
    });

    // Merge counts with product lines
    const result = (productLines || []).map((pl: any) => ({
      id: pl.id,
      code: pl.code,
      name: pl.name,
      slug: pl.slug,
      active: pl.active,
      display_order: pl.display_order,
      asset_count: counts[pl.code] || 0,
    }));

    return NextResponse.json({ productLines: result });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Product lines fetch failed', err);
    return NextResponse.json({ error: err.message || 'Failed to load product lines' }, { status: 500 });
  }
}

// PATCH /api/admin/product-lines - Update product line
export async function PATCH(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();
    const { id, name, slug, active, display_order } = body;

    if (!id) {
      return NextResponse.json({ error: 'Product line ID is required' }, { status: 400 });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (active !== undefined) updateData.active = active;
    if (display_order !== undefined) updateData.display_order = display_order;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('dam_product_lines')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // Check for unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A product line with this slug already exists' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ productLine: data });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Product line update failed', err);
    return NextResponse.json({ error: err.message || 'Failed to update product line' }, { status: 500 });
  }
}

// POST /api/admin/product-lines - Create new product line
export async function POST(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();
    const { name, slug, active } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Product line name is required' }, { status: 400 });
    }

    // Generate slug from name if not provided
    const finalSlug = slug || name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if product line with this slug already exists
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('dam_product_lines')
      .select('id, code, slug')
      .eq('slug', finalSlug)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existing) {
      return NextResponse.json({ error: 'A product line with this slug already exists' }, { status: 400 });
    }

    // Use code = slug for consistency
    const insertData: any = {
      code: finalSlug,
      name: name.trim(),
      slug: finalSlug,
      active: active !== undefined ? active : true,
    };

    const { data, error } = await supabaseAdmin
      .from('dam_product_lines')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A product line with this slug already exists' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ productLine: data });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Product line create failed', err);
    return NextResponse.json({ error: err.message || 'Failed to create product line' }, { status: 500 });
  }
}

// DELETE /api/admin/product-lines - Delete product line (only if not in use)
export async function DELETE(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Product line ID is required' }, { status: 400 });
    }

    // Get product line code
    const { data: pl, error: plError } = await supabaseAdmin
      .from('dam_product_lines')
      .select('code')
      .eq('id', id)
      .single();

    if (plError) throw plError;
    if (!pl) {
      return NextResponse.json({ error: 'Product line not found' }, { status: 404 });
    }

    // Check if any assets use this product line
    const { count, error: countError } = await supabaseAdmin
      .from('dam_assets')
      .select('*', { count: 'exact', head: true })
      .eq('product_line', pl.code);

    if (countError) throw countError;

    if (count && count > 0) {
      return NextResponse.json(
        { error: `This product line is in use by ${count} asset(s) and cannot be deleted. Deactivate instead.` },
        { status: 400 }
      );
    }

    // Delete the product line
    const { error: deleteError } = await supabaseAdmin
      .from('dam_product_lines')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Product line delete failed', err);
    return NextResponse.json({ error: err.message || 'Failed to delete product line' }, { status: 500 });
  }
}

