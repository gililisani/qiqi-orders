import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission } from '@/platform/auth/guards';
import {
  pullDocumentContext,
  evaluateDocChange,
  findBestDate,
  type DocChange,
} from '@/lib/inventory/documentImpact';

export const maxDuration = 120;

// GET ?doc=IT10186 — pull the document + its full multi-item footprint, and
// pre-compute the DELETE impact and the best CHANGE-DATE option.
export async function GET(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const doc = new URL(request.url).searchParams.get('doc')?.trim();
    if (!doc) return NextResponse.json({ error: 'doc query param required' }, { status: 400 });

    const ctx = await pullDocumentContext(doc);
    const deleteImpact = evaluateDocChange(ctx, { kind: 'delete' });
    const { best, cleanDate } = findBestDate(ctx);

    return NextResponse.json({
      document: {
        docNumber: ctx.docNumber,
        nsType: ctx.nsType,
        tranDate: ctx.tranDate,
        itemCount: ctx.itemCount,
        locationNames: ctx.locationNames,
        legs: ctx.legs,
      },
      deleteImpact,
      bestDate: best,
      cleanDate,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[document-impact GET]', err);
    return NextResponse.json({ error: err?.message || 'Failed to analyze document' }, { status: 500 });
  }
}

// POST { doc, change } — evaluate a SPECIFIC proposed change (delete or a chosen date).
export async function POST(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const body = await request.json().catch(() => ({}));
    const doc = String(body.doc || '').trim();
    const change = body.change as DocChange;
    if (!doc || !change || (change.kind !== 'delete' && change.kind !== 'changeDate')) {
      return NextResponse.json({ error: 'doc and a valid change required' }, { status: 400 });
    }
    if (change.kind === 'changeDate' && !/^\d{4}-\d{2}-\d{2}$/.test(change.newDate)) {
      return NextResponse.json({ error: 'changeDate requires newDate YYYY-MM-DD' }, { status: 400 });
    }
    const ctx = await pullDocumentContext(doc);
    const impact = evaluateDocChange(ctx, change);
    return NextResponse.json({ impact, tranDate: ctx.tranDate });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[document-impact POST]', err);
    return NextResponse.json({ error: err?.message || 'Failed to evaluate' }, { status: 500 });
  }
}
