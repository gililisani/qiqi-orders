import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission } from '@/platform/auth/guards';
import {
  readTrustedPoints,
  readAllTrustedPoints,
  upsertTrustedPoints,
  deleteTrustedPoint,
  deleteTrustedPointsForItem,
} from '@/lib/inventory/trustedPoints';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET [?item=CODE] — list trusted points (all, or one item's).
export async function GET(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const item = new URL(request.url).searchParams.get('item');
    if (item) return NextResponse.json({ points: await readTrustedPoints(item) });
    const byItem = await readAllTrustedPoints();
    return NextResponse.json({ points: [...byItem.values()].flat() });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[trusted-points GET]', err);
    return NextResponse.json({ error: err?.message || 'Failed to list points' }, { status: 500 });
  }
}

// POST { points: [{itemCode, locationName, asOfDate, qty}], source? } — upsert.
export async function POST(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const body = await request.json().catch(() => ({}));
    const points = Array.isArray(body?.points) ? body.points : [];
    const source = body?.source === 'manual' ? 'manual' : 'negatives_page';
    for (const p of points) {
      if (!p?.itemCode || !p?.locationName || !ISO_DATE.test(String(p?.asOfDate)) || !Number.isFinite(Number(p?.qty))) {
        return NextResponse.json(
          { error: 'each point needs itemCode, locationName, asOfDate (YYYY-MM-DD), numeric qty' },
          { status: 400 },
        );
      }
    }
    const count = await upsertTrustedPoints(
      points.map((p: any) => ({
        itemCode: String(p.itemCode),
        locationName: String(p.locationName),
        asOfDate: String(p.asOfDate),
        qty: Number(p.qty),
      })),
      source,
    );
    return NextResponse.json({ success: true, count });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[trusted-points POST]', err);
    return NextResponse.json({ error: err?.message || 'Failed to save points' }, { status: 500 });
  }
}

// DELETE ?id=<uuid> | ?item=CODE — remove one point, or all of an item's.
export async function DELETE(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const item = url.searchParams.get('item');
    if (id) await deleteTrustedPoint(id);
    else if (item) await deleteTrustedPointsForItem(item);
    else return NextResponse.json({ error: 'id or item required' }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[trusted-points DELETE]', err);
    return NextResponse.json({ error: err?.message || 'Delete failed' }, { status: 500 });
  }
}
