import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission } from '@/platform/auth/guards';
import { computeCatalogWorklist } from '@/lib/inventory/worklistPull';
import { writeWorklist } from '@/lib/inventory/worklistCache';

// Recompute is a heavy catalog-wide pull from NetSuite — allow up to 5 minutes.
// If it exceeds the platform limit, run `npm run inv:worklist` locally instead.
export const maxDuration = 300;

// POST — pull the whole inventory ledger, recompute recommendations, cache.
export async function POST(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const startedAt = Date.now();
    const comp = await computeCatalogWorklist();
    const durationMs = Date.now() - startedAt;
    await writeWorklist(comp, durationMs);
    return NextResponse.json({ success: true, durationMs, ...comp.stats });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[worklist recompute]', err);
    return NextResponse.json({ error: err?.message || 'Recompute failed' }, { status: 500 });
  }
}
