import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission } from '@/platform/auth/guards';
import { pullItemInventory } from '@/lib/inventory/netsuitePull';
import { writeCache } from '@/lib/inventory/cache';

// POST — pull the item's full inventory history from NetSuite and cache it.
// On-demand only (refresh button), never on page load. Plan markers survive.
export async function POST(
  request: NextRequest,
  { params }: { params: { itemCode: string } },
) {
  try {
    await requireWithPermission(request, 'netsuite');
    const code = decodeURIComponent(params.itemCode).trim().toUpperCase();
    if (!code) return NextResponse.json({ error: 'itemCode required' }, { status: 400 });

    const pulled = await pullItemInventory(code);
    await writeCache(pulled);

    return NextResponse.json({
      success: true,
      itemCode: code,
      itemName: pulled.itemName,
      transactionCount: pulled.transactions.length,
      locationCount: pulled.openings.length,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[inventory-investigation refresh]', err);
    return NextResponse.json({ error: err?.message || 'Refresh failed' }, { status: 500 });
  }
}
