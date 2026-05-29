import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission, createServiceRoleClient } from '@/platform/auth/guards';

// GET — list items already cached, most-recently-refreshed first.
// (Phase 4 will rank by suspect count; for now it's a simple revisit list.)
export async function GET(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from('inv_inv_items')
      .select('item_code, item_name, item_type, last_refreshed_at, date_min, date_max')
      .order('last_refreshed_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return NextResponse.json({ items: data ?? [] });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[inventory-investigation list]', err);
    return NextResponse.json({ error: err?.message || 'Failed to list' }, { status: 500 });
  }
}
