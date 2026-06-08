import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission } from '@/platform/auth/guards';
import { setWorklistStatus, type WorklistStatus } from '@/lib/inventory/worklistCache';

const VALID: WorklistStatus[] = ['todo', 'done', 'skipped'];

// POST { itemCode, locationNsId, status } — mark a worklist row.
export async function POST(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const body = await request.json().catch(() => ({}));
    const itemCode = String(body.itemCode || '').trim();
    const locationNsId = String(body.locationNsId || '').trim();
    const since = body.since ? String(body.since) : null;
    const status = body.status as WorklistStatus;
    if (!itemCode || !locationNsId || !VALID.includes(status)) {
      return NextResponse.json({ error: 'itemCode, locationNsId and valid status required' }, { status: 400 });
    }
    await setWorklistStatus(itemCode, locationNsId, since, status);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[worklist status]', err);
    return NextResponse.json({ error: err?.message || 'Failed to set status' }, { status: 500 });
  }
}
