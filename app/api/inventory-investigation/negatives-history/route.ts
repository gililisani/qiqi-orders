import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission } from '@/platform/auth/guards';
import { readNegativeWindows } from '@/lib/inventory/worklistCache';

// GET — every negative window found in the last catalog recompute.
export async function GET(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const windows = await readNegativeWindows();
    return NextResponse.json({ windows });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[negatives-history GET]', err);
    return NextResponse.json({ error: err?.message || 'Failed to load history' }, { status: 500 });
  }
}
