import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission } from '@/platform/auth/guards';
import { readCache } from '@/lib/inventory/cache';

// GET cached inventory data for an item. Returns { cached: false } when the
// item hasn't been pulled yet (the page then prompts a refresh).
export async function GET(
  request: NextRequest,
  { params }: { params: { itemCode: string } },
) {
  try {
    await requireWithPermission(request, 'netsuite');
    const code = decodeURIComponent(params.itemCode).trim().toUpperCase();
    if (!code) return NextResponse.json({ error: 'itemCode required' }, { status: 400 });

    const cached = await readCache(code);
    if (!cached) return NextResponse.json({ cached: false, itemCode: code });
    return NextResponse.json({ cached: true, ...cached });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[inventory-investigation GET]', err);
    return NextResponse.json({ error: err?.message || 'Failed to load' }, { status: 500 });
  }
}
