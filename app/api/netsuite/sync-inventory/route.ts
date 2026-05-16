import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';

// POST body: { locationId: string } — Hub Locations.id (UUID)
// Fetches inventory from NS for that location and updates Products table
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { locationId } = await request.json();
    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Get the NS internal ID for this location
    const { data: location, error: locError } = await supabase
      .from('Locations')
      .select('id, location_name, netsuite_id')
      .eq('id', locationId)
      .single();

    if (locError || !location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    if (!location.netsuite_id) {
      return NextResponse.json(
        { error: `Location "${location.location_name}" has no NetSuite ID set. Edit the location and add it.` },
        { status: 400 }
      );
    }

    const ns = createNetSuiteAPI();
    const items = await ns.getInventoryByLocation(location.netsuite_id);

    if (items.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: 'No inventory items found for this location in NetSuite.' });
    }

    // Fetch all Products by SKU so we can map SKU → Hub product ID
    const skus = items.map(i => i.sku).filter(Boolean);
    const { data: products } = await supabase
      .from('Products')
      .select('id, sku')
      .in('sku', skus);

    const skuToProductId = new Map((products || []).map((p: any) => [p.sku, p.id]));

    // Upsert inventory levels into a separate table so we don't overwrite product master data
    // Using a simple approach: update a stock_quantity field on Products if it exists,
    // otherwise insert into an inventory_levels table.
    // We'll use inventory_levels (created below if not existing) for clean separation.
    let updated = 0;
    const upsertRows = items
      .filter(i => skuToProductId.has(i.sku))
      .map(i => ({
        product_id: skuToProductId.get(i.sku),
        location_id: locationId,
        quantity_on_hand: i.quantityOnHand,
        quantity_available: i.quantityAvailable,
        synced_at: new Date().toISOString(),
      }));

    if (upsertRows.length > 0) {
      const { error: upsertError } = await supabase
        .from('inventory_levels')
        .upsert(upsertRows, { onConflict: 'product_id,location_id' });

      if (upsertError) {
        console.error('inventory_levels upsert error:', upsertError);
        return NextResponse.json({ error: 'Failed to save inventory data: ' + upsertError.message }, { status: 500 });
      }
      updated = upsertRows.length;
    }

    return NextResponse.json({
      success: true,
      updated,
      total: items.length,
      message: `Synced ${updated} products for ${location.location_name}.`,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('sync-inventory error:', error);
    return NextResponse.json({ error: error.message || 'Failed to sync inventory' }, { status: 500 });
  }
}

// GET — return current inventory levels for a location
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('locationId');

    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('inventory_levels')
      .select(`
        quantity_on_hand,
        quantity_available,
        synced_at,
        product:Products(id, sku, item_name)
      `)
      .eq('location_id', locationId)
      .order('synced_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data || [] });
  } catch (error: any) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: error.message || 'Failed to fetch inventory' }, { status: 500 });
  }
}
