import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../../lib/netsuite';

// GET - list all Amazon product → NS item mappings
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const supabaseAdmin = createServiceRoleClient();
    const { data, error } = await supabaseAdmin
      .from('amazon_item_map')
      .select('*')
      .order('amazon_name');
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, mappings: data || [] });
  } catch (error: any) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: error.message || 'Failed to load mappings.' }, { status: 500 });
  }
}

// POST - upsert a mapping (keyed by amazon_name)
//
// Two ways to identify the NetSuite item:
//   { sku }                    — preferred: a Hub catalog product's SKU; the
//                                internal ID is resolved via the same lookup
//                                the Sales Order push uses.
//   { ns_item_id, ns_item_name } — direct NS internal id (the fallback
//                                "search NetSuite" path in the modal).
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const body = await request.json();
    const { amazon_name, sku, unit_price } = body;
    let { ns_item_id, ns_item_name } = body;

    if (!amazon_name || typeof amazon_name !== 'string' || !amazon_name.trim()) {
      return NextResponse.json({ error: 'Amazon product name is required.' }, { status: 400 });
    }
    const price = Number(unit_price);
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: 'Unit price must be a positive number.' }, { status: 400 });
    }

    if (sku && typeof sku === 'string') {
      const ns = createNetSuiteAPI();
      const skuToId = await ns.resolveItemIdsBySku([sku.trim()]);
      const resolvedId = skuToId.get(sku.trim());
      if (!resolvedId) {
        return NextResponse.json(
          {
            error: `SKU "${sku}" was not found as an item in NetSuite. The catalog's NetSuite name/SKU may be out of date — fix the product in the Hub or use "Search NetSuite directly".`,
          },
          { status: 400 }
        );
      }
      ns_item_id = resolvedId;
      if (!ns_item_name) ns_item_name = sku.trim();
    }

    if (!ns_item_id || !ns_item_name) {
      return NextResponse.json({ error: 'A NetSuite item is required.' }, { status: 400 });
    }

    const supabaseAdmin = createServiceRoleClient();
    const { data, error } = await supabaseAdmin
      .from('amazon_item_map')
      .upsert(
        {
          amazon_name: amazon_name.trim(),
          ns_item_id: String(ns_item_id),
          ns_item_name: String(ns_item_name),
          unit_price: price,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'amazon_name' }
      )
      .select()
      .single();
    if (error) {
      if (error.message?.includes('does not exist')) {
        return NextResponse.json(
          { error: 'Database migration required', details: 'Run 20260729120000_amazon_fba.sql in the Supabase SQL editor first.' },
          { status: 500 }
        );
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ success: true, mapping: data });
  } catch (error: any) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: error.message || 'Failed to save mapping.' }, { status: 500 });
  }
}

// DELETE ?id= - remove a mapping
export async function DELETE(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
    const supabaseAdmin = createServiceRoleClient();
    const { error } = await supabaseAdmin.from('amazon_item_map').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: error.message || 'Failed to delete mapping.' }, { status: 500 });
  }
}
