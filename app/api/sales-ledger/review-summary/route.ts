import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { isCredit } from '../../../../lib/salesLedger/review';
import { loadReviewState, statusesFor } from '../../../../lib/salesLedger/reviewData';

/**
 * NetSuite review overview (distributors:view): per company, how many
 * NetSuite documents still wait for a decision, how many are decided, and
 * when it last synced. Read-only.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'distributors:view');
    const supabase = createServiceRoleClient();
    const [companiesRes, syncRes, state] = await Promise.all([
      supabase.from('companies').select('id, company_name, netsuite_internal_id').order('company_name'),
      supabase.from('sales_company_sync').select('company_id, last_synced_at, last_error'),
      loadReviewState(supabase, null),
    ]);
    if (companiesRes.error) throw new Error(companiesRes.error.message);
    if (syncRes.error) throw new Error(syncRes.error.message);

    const statuses = statusesFor(state.docs, state.orders, state.reviews);
    const per = new Map<string, { invoices: number; credits: number; amount: number; decided: number; documents: number }>();
    for (const d of state.docs) {
      const e = per.get(d.company_id) ?? { invoices: 0, credits: 0, amount: 0, decided: 0, documents: 0 };
      e.documents += 1;
      const s = statuses.get(d.id);
      if (s === 'to_review') {
        if (isCredit(d.doc_type)) e.credits += 1;
        else e.invoices += 1;
        e.amount += d.sales_amount;
      } else if (s === 'decided') e.decided += 1;
      per.set(d.company_id, e);
    }
    const sync = new Map((syncRes.data ?? []).map((s: any) => [s.company_id, s]));
    const rows = (companiesRes.data ?? [])
      .filter((c: any) => /^\d+$/.test(String(c.netsuite_internal_id ?? '').trim()) || per.has(c.id))
      .map((c: any) => {
        const e = per.get(c.id) ?? { invoices: 0, credits: 0, amount: 0, decided: 0, documents: 0 };
        const s: any = sync.get(c.id);
        return {
          companyId: c.id,
          name: c.company_name,
          toReviewInvoices: e.invoices,
          toReviewCredits: e.credits,
          toReviewAmount: Math.round(e.amount * 100) / 100,
          decided: e.decided,
          documents: e.documents,
          lastSyncedAt: s?.last_synced_at ?? null,
          lastError: s?.last_error ?? null,
        };
      });
    return NextResponse.json({ companies: rows });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err?.message || 'Failed to load the NetSuite review overview.' }, { status: 500 });
  }
}
