import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../../platform/auth/guards';
import { undoBlockers, validateDecision, type ReviewDecision } from '../../../../../../lib/salesLedger/review';
import { loadReviewState } from '../../../../../../lib/salesLedger/reviewData';
import { recalculateCompanyTargetPeriods } from '../../../../../../lib/targetPeriods';

/** Decisions change what counts — keep the stored goal progress in step (best effort). */
async function recalcTargets(supabase: ReturnType<typeof createServiceRoleClient>, companyId: string) {
  try {
    await recalculateCompanyTargetPeriods(supabase, companyId);
  } catch (err) {
    console.error('[netsuite-review] target recalculation failed:', companyId, err);
  }
}

/**
 * NetSuite review decisions for one company (distributors:edit).
 *
 * POST   { documentIds, decision, orderId?, attachedDocumentId?, reason? }
 *        — record (or change) the decision on every listed document.
 * DELETE { documentIds } — undo: the documents go back to "to review".
 *
 * All-or-nothing: every document is validated against the rules in
 * lib/salesLedger/review before anything is written; one invalid document
 * refuses the whole batch and names it.
 */

const DECISIONS: ReviewDecision[] = ['outside_sale', 'attach', 'company_credit', 'ignore'];
const MAX_BATCH = 500;

function readIds(body: any): string[] | null {
  const ids = Array.isArray(body?.documentIds) ? body.documentIds.map((x: unknown) => String(x)) : [];
  const unique = Array.from(new Set(ids)) as string[];
  if (!unique.length || unique.length > MAX_BATCH) return null;
  return unique;
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id: companyId } = await props.params;
  try {
    const admin = await requireAdminWithPermission(request, 'distributors:edit');
    const body = await request.json().catch(() => ({}));
    const ids = readIds(body);
    if (!ids) return NextResponse.json({ error: `Choose between 1 and ${MAX_BATCH} documents.` }, { status: 400 });
    const decision = String(body?.decision ?? '') as ReviewDecision;
    if (!DECISIONS.includes(decision)) return NextResponse.json({ error: 'Unknown decision.' }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { docs, orders, reviews } = await loadReviewState(supabase, [companyId]);
    const byId = new Map(docs.map((d) => [d.id, d]));
    const orderStatus = new Map(orders.map((o) => [o.id, o.status]));
    const outsideSaleIds = new Set(
      Array.from(reviews.values()).filter((r) => r.decision === 'outside_sale').map((r) => r.document_id)
    );
    const allReviews = Array.from(reviews.values());

    const input = {
      decision,
      orderId: body?.orderId ? String(body.orderId) : null,
      attachedDocumentId: body?.attachedDocumentId ? String(body.attachedDocumentId) : null,
      reason: body?.reason ? String(body.reason) : null,
    };
    for (const docId of ids) {
      const doc = byId.get(docId);
      if (!doc) return NextResponse.json({ error: 'A document isn’t in this company’s NetSuite review.' }, { status: 400 });
      const problem = validateDecision(doc, input, {
        companyId,
        orders: orderStatus,
        outsideSaleIds,
        linkedOrderStatus: doc.order_id ? orderStatus.get(doc.order_id) ?? null : null,
      });
      if (problem) return NextResponse.json({ error: `${doc.tranid}: ${problem}` }, { status: 400 });
      // Changing an outside sale into something else would orphan credits attached to it.
      if (decision !== 'outside_sale') {
        const blockers = undoBlockers(docId, allReviews).filter((b) => !ids.includes(b));
        if (blockers.length) {
          const names = blockers.map((b) => byId.get(b)?.tranid ?? b).join(', ');
          return NextResponse.json({ error: `${doc.tranid}: credits ${names} are attached to it — change those first.` }, { status: 409 });
        }
      }
    }

    const now = new Date().toISOString();
    const rows = ids.map((docId) => ({
      document_id: docId,
      decision,
      order_id: decision === 'attach' ? input.orderId : null,
      attached_document_id: decision === 'attach' ? input.attachedDocumentId : null,
      reason: input.reason?.trim() || null,
      decided_by: admin.id,
      decided_at: now,
    }));
    const { error } = await supabase.from('sales_document_reviews').upsert(rows, { onConflict: 'document_id' });
    if (error) throw new Error(error.message);
    await recalcTargets(supabase, companyId);
    return NextResponse.json({ saved: rows.length });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err?.message || 'Failed to save the decision.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id: companyId } = await props.params;
  try {
    await requireAdminWithPermission(request, 'distributors:edit');
    const body = await request.json().catch(() => ({}));
    const ids = readIds(body);
    if (!ids) return NextResponse.json({ error: `Choose between 1 and ${MAX_BATCH} documents.` }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { docs, reviews } = await loadReviewState(supabase, [companyId]);
    const byId = new Map(docs.map((d) => [d.id, d]));
    const allReviews = Array.from(reviews.values());
    for (const docId of ids) {
      const doc = byId.get(docId);
      if (!doc) return NextResponse.json({ error: 'A document isn’t in this company’s NetSuite review.' }, { status: 400 });
      const blockers = undoBlockers(docId, allReviews).filter((b) => !ids.includes(b));
      if (blockers.length) {
        const names = blockers.map((b) => byId.get(b)?.tranid ?? b).join(', ');
        return NextResponse.json({ error: `${doc.tranid}: credits ${names} are attached to it — undo those first.` }, { status: 409 });
      }
    }
    for (let i = 0; i < ids.length; i += 150) {
      const { error } = await supabase.from('sales_document_reviews').delete().in('document_id', ids.slice(i, i + 150));
      if (error) throw new Error(error.message);
    }
    await recalcTargets(supabase, companyId);
    return NextResponse.json({ undone: ids.length });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err?.message || 'Failed to undo.' }, { status: 500 });
  }
}
