import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission } from '@/platform/auth/guards';
import { readResiduals } from '@/lib/inventory/worklistCache';

// GET — phantom residuals (NS on-hand vs transaction history) from the last recompute.
export async function GET(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const residuals = await readResiduals();
    return NextResponse.json({ residuals });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[data-integrity GET]', err);
    return NextResponse.json({ error: err?.message || 'Failed to load' }, { status: 500 });
  }
}
