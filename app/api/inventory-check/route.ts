import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../platform/auth/guards';
import { runInventoryCheck } from '../../../lib/inventoryCheck/run';
import { loadInventoryCheckView } from '../../../lib/inventoryCheck/read';
import { inventoryCheckUnavailable, liveInventoryCheckDeps } from '../../../lib/inventoryCheck/live';

// Route-level export: vercel.json maxDuration is not honored for Next routes.
export const maxDuration = 120;

/**
 * Inventory Check — NetSuite vs ShipHero stock per SKU.
 * GET (orders:view): ?location=<Locations.id>&check=<inventory_checks.id>
 * POST (orders:edit): check now (read-only towards NetSuite and ShipHero).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'orders:view');
    const params = request.nextUrl.searchParams;
    const view = await loadInventoryCheckView(createServiceRoleClient(), {
      locationId: params.get('location'),
      checkId: params.get('check'),
    });
    return NextResponse.json({ ...view, unavailable: inventoryCheckUnavailable() });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[inventory-check] GET', err);
    return NextResponse.json({ error: err?.message || 'Failed to load the inventory check.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminWithPermission(request, 'orders:edit');
    const unavailable = inventoryCheckUnavailable();
    if (unavailable) return NextResponse.json({ error: unavailable }, { status: 409 });

    const supabase = createServiceRoleClient();
    // A double click (or two admins) within a minute reuses the fresh check.
    const { data: recent } = await supabase
      .from('inventory_checks')
      .select('id')
      .gte('checked_at', new Date(Date.now() - 60_000).toISOString())
      .limit(1);
    if (recent?.length) return NextResponse.json({ success: true, reused: true });

    const results = await runInventoryCheck(supabase, liveInventoryCheckDeps(), { trigger: 'manual', checkedBy: user.id });
    const failed = results.find((r) => r.error);
    return NextResponse.json({ success: !failed, results, ...(failed ? { error: failed.error } : {}) });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[inventory-check] POST', err);
    return NextResponse.json({ error: err?.message || 'The inventory check failed.' }, { status: 500 });
  }
}
