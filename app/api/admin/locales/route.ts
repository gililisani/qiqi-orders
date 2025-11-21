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

// GET /api/admin/locales - List all locales with asset counts
export async function GET(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();

    // Fetch all locales
    const { data: locales, error: localesError } = await supabaseAdmin
      .from('dam_locales')
      .select('*')
      .order('label', { ascending: true });

    if (localesError) throw localesError;

    // Count assets per locale via dam_asset_locale_map
    const { data: localeMaps, error: mapError } = await supabaseAdmin
      .from('dam_asset_locale_map')
      .select('locale_code');

    if (mapError) throw mapError;

    // Calculate counts
    const counts: Record<string, number> = {};
    (localeMaps || []).forEach((map: any) => {
      if (map.locale_code) {
        counts[map.locale_code] = (counts[map.locale_code] || 0) + 1;
      }
    });

    // Merge counts with locales
    const result = (locales || []).map((locale: any) => ({
      code: locale.code,
      label: locale.label,
      is_default: locale.is_default,
      active: locale.active !== undefined ? locale.active : true, // Default to true if column doesn't exist
      asset_count: counts[locale.code] || 0,
    }));

    return NextResponse.json({ locales: result });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Locales fetch failed', err);
    return NextResponse.json({ error: err.message || 'Failed to load locales' }, { status: 500 });
  }
}

// PATCH /api/admin/locales - Update locale
export async function PATCH(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();
    const { code, label, active, is_default } = body;

    if (!code) {
      return NextResponse.json({ error: 'Locale code is required' }, { status: 400 });
    }

    const updateData: any = {};
    if (label !== undefined) updateData.label = label;
    if (active !== undefined) updateData.active = active;
    if (is_default !== undefined) updateData.is_default = is_default;

    const { data, error } = await supabaseAdmin
      .from('dam_locales')
      .update(updateData)
      .eq('code', code)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ locale: data });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Locale update failed', err);
    return NextResponse.json({ error: err.message || 'Failed to update locale' }, { status: 500 });
  }
}

// POST /api/admin/locales - Create new locale
export async function POST(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();
    const { code, label } = body;

    if (!code || !label || typeof code !== 'string' || typeof label !== 'string') {
      return NextResponse.json({ error: 'Locale code and label are required' }, { status: 400 });
    }

    // Check if locale with this code already exists
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('dam_locales')
      .select('code')
      .eq('code', code.trim().toLowerCase())
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existing) {
      return NextResponse.json({ error: 'A locale with this code already exists' }, { status: 400 });
    }

    const insertData: any = {
      code: code.trim().toLowerCase(),
      label: label.trim(),
      is_default: false,
      active: true, // Default to active
    };

    const { data, error } = await supabaseAdmin
      .from('dam_locales')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A locale with this code already exists' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ locale: data });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Locale create failed', err);
    return NextResponse.json({ error: err.message || 'Failed to create locale' }, { status: 500 });
  }
}

// DELETE /api/admin/locales - Delete locale (only if not in use)
export async function DELETE(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: 'Locale code is required' }, { status: 400 });
    }

    // Check if any assets use this locale
    const { count, error: countError } = await supabaseAdmin
      .from('dam_asset_locale_map')
      .select('*', { count: 'exact', head: true })
      .eq('locale_code', code);

    if (countError) throw countError;

    if (count && count > 0) {
      return NextResponse.json(
        { error: `This locale is in use by ${count} asset(s) and cannot be deleted. Deactivate instead.` },
        { status: 400 }
      );
    }

    // Delete the locale
    const { error: deleteError } = await supabaseAdmin
      .from('dam_locales')
      .delete()
      .eq('code', code);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Locale delete failed', err);
    return NextResponse.json({ error: err.message || 'Failed to delete locale' }, { status: 500 });
  }
}

