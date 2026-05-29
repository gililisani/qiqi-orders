import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission } from '@/platform/auth/guards';
import { readWorklist } from '@/lib/inventory/worklistCache';

// GET — the cached worklist (rows + run meta).
export async function GET(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const { rows, meta } = await readWorklist();
    return NextResponse.json({ rows, meta });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[worklist GET]', err);
    return NextResponse.json({ error: err?.message || 'Failed to load worklist' }, { status: 500 });
  }
}
