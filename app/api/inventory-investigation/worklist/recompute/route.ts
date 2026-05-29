import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission } from '@/platform/auth/guards';
import { computeCatalogWorklist } from '@/lib/inventory/worklistPull';
import { writeWorklist } from '@/lib/inventory/worklistCache';
import { validateWorklist } from '@/lib/inventory/worklist';

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

    // Hard safety self-check — never write recommendations that break the rules.
    const { nonEditable, closedPeriod } = validateWorklist(comp.rows);
    if (nonEditable.length > 0 || closedPeriod.length > 0) {
      console.error('[worklist recompute] RULE VIOLATION — not writing', {
        nonEditable: nonEditable.slice(0, 5),
        closedPeriod: closedPeriod.slice(0, 5),
      });
      return NextResponse.json(
        {
          error: 'Self-check failed: recommendations violated the editable-type / closed-period rules. Worklist NOT updated.',
          nonEditableCount: nonEditable.length,
          closedPeriodCount: closedPeriod.length,
        },
        { status: 500 },
      );
    }

    await writeWorklist(comp, durationMs);
    return NextResponse.json({ success: true, durationMs, ...comp.stats });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[worklist recompute]', err);
    return NextResponse.json({ error: err?.message || 'Recompute failed' }, { status: 500 });
  }
}
