import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission } from '@/platform/auth/guards';
import { fetchStockMatrix } from '@/lib/inventory/webQuery';
import { captureSnapshot, deleteSnapshot, listSnapshotDates } from '@/lib/inventory/datedSnapshots';

export const maxDuration = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET — list captured snapshot dates (most recent first).
export async function GET(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    return NextResponse.json({ dates: await listSnapshotDates() });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[snapshots GET]', err);
    return NextResponse.json({ error: err?.message || 'Failed to list snapshots' }, { status: 500 });
  }
}

// POST { asOfDate } — fetch the CURRENT report feed and store it tagged with the
// given as-of date. The caller must have set the report's "As of" to that date
// in NetSuite first (the feed carries no date of its own, so we trust the label).
export async function POST(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const body = await request.json().catch(() => ({}));
    const asOfDate = String(body?.asOfDate ?? '').trim();
    if (!ISO_DATE.test(asOfDate)) {
      return NextResponse.json({ error: 'asOfDate must be YYYY-MM-DD' }, { status: 400 });
    }
    const rows = await fetchStockMatrix();
    const count = await captureSnapshot(asOfDate, rows);
    const negatives = rows.filter((r) => r.qoh < 0).length;
    return NextResponse.json({ success: true, asOfDate, count, negatives });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[snapshots POST]', err);
    return NextResponse.json({ error: err?.message || 'Capture failed' }, { status: 500 });
  }
}

// DELETE ?date=YYYY-MM-DD — remove a captured snapshot.
export async function DELETE(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const date = new URL(request.url).searchParams.get('date') ?? '';
    if (!ISO_DATE.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    await deleteSnapshot(date);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[snapshots DELETE]', err);
    return NextResponse.json({ error: err?.message || 'Delete failed' }, { status: 500 });
  }
}
