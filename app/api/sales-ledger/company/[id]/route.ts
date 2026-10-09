import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { reconcileCompany } from '../../../../../lib/salesLedger/reconcile';
import { isCredit, suggestFromNetSuite, suggestTarget } from '../../../../../lib/salesLedger/review';
import { adminNames, loadReviewState, statusesFor } from '../../../../../lib/salesLedger/reviewData';

/**
 * One company's NetSuite review (distributors:view): every NetSuite document
 * with its review status and decision, the Hub orders with what NetSuite
 * billed and credited against them, and the targets an admin can attach
 * documents to. Read-only.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    await requireAdminWithPermission(request, 'distributors:view');
    const supabase = createServiceRoleClient();

    const [companyRes, syncRes, settingsRes, state] = await Promise.all([
      supabase
        .from('companies')
        .select('id, company_name, netsuite_number, netsuite_internal_id, contract_execution_date')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('sales_company_sync').select('*').eq('company_id', id).maybeSingle(),
      supabase.from('sales_settings').select('history_start_date').eq('id', 1).maybeSingle(),
      loadReviewState(supabase, [id], { withLines: true }),
    ]);
    for (const r of [companyRes, syncRes, settingsRes]) {
      if (r.error) throw new Error(r.error.message);
    }
    if (!companyRes.data) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const { docs, orders, reviews } = state;
    const statuses = statusesFor(docs, orders, reviews);
    const names = await adminNames(supabase, Array.from(reviews.values()).map((r) => r.decided_by ?? ''));
    const byId = new Map(docs.map((d) => [d.id, d]));

    // Billing per Hub order: invoices NetSuite linked (same sales order) plus
    // invoices an admin attached; credits attached reduce the order's value.
    const billingDocs = docs
      .filter((d) => !isCredit(d.doc_type))
      .map((d) => {
        const r = reviews.get(d.id);
        const orderId = r?.decision === 'attach' && r.order_id ? r.order_id : statuses.get(d.id) === 'auto' ? d.order_id : null;
        return { ...d, order_id: orderId };
      });
    const recon = reconcileCompany({
      contractDate: companyRes.data.contract_execution_date ?? null,
      orders: orders as any[],
      documents: billingDocs as any[],
    });
    const creditsByOrder = new Map<string, { amount: number; documents: string[] }>();
    const creditsByOutsideSale = new Map<string, { amount: number; documents: string[] }>();
    for (const r of reviews.values()) {
      const d = byId.get(r.document_id);
      if (!d || !isCredit(d.doc_type) || r.decision !== 'attach') continue;
      const map = r.order_id ? creditsByOrder : creditsByOutsideSale;
      const key = (r.order_id ?? r.attached_document_id)!;
      const entry = map.get(key) ?? { amount: 0, documents: [] };
      entry.amount += d.sales_amount;
      entry.documents.push(d.tranid);
      map.set(key, entry);
    }

    const counts = { toReviewInvoices: 0, toReviewCredits: 0, toReviewAmount: 0, decided: 0, auto: 0, nothingToCount: 0 };
    for (const d of docs) {
      const s = statuses.get(d.id)!;
      if (s === 'to_review') {
        if (isCredit(d.doc_type)) counts.toReviewCredits += 1;
        else counts.toReviewInvoices += 1;
        counts.toReviewAmount += d.sales_amount;
      } else if (s === 'decided') counts.decided += 1;
      else if (s === 'auto') counts.auto += 1;
      else counts.nothingToCount += 1;
    }
    const decidedTotals = { outsideSales: 0, credits: 0 };
    for (const r of reviews.values()) {
      const d = byId.get(r.document_id);
      if (!d) continue;
      if (r.decision === 'outside_sale') decidedTotals.outsideSales += d.sales_amount;
      if (isCredit(d.doc_type) && (r.decision === 'attach' || r.decision === 'company_credit')) decidedTotals.credits += d.sales_amount;
    }

    // NetSuite's own credit → invoice links (traced by the sync) beat memo / PO guesses.
    const linkCtx = {
      docsByNsId: new Map(docs.map((d) => [d.netsuite_id, d])),
      reviews,
      orders: new Map(orders.map((o) => [o.id, o])),
    };
    return NextResponse.json({
      company: {
        id: companyRes.data.id,
        name: companyRes.data.company_name,
        netsuiteNumber: companyRes.data.netsuite_number,
        linked: /^\d+$/.test(String(companyRes.data.netsuite_internal_id ?? '').trim()),
        contractDate: companyRes.data.contract_execution_date ?? null,
      },
      historyStartDate: settingsRes.data?.history_start_date ?? null,
      sync: syncRes.data ?? null,
      counts,
      decidedTotals,
      orders: recon.orders.map((o) => {
        const credits = creditsByOrder.get(o.orderId);
        return {
          ...o,
          credits: credits?.amount ?? 0,
          creditDocuments: credits?.documents ?? [],
          valueAfterCredits: o.hubTotal + (credits?.amount ?? 0),
        };
      }),
      documents: docs.map((d) => {
        const r = reviews.get(d.id) ?? null;
        const credits = creditsByOutsideSale.get(d.id);
        return {
          id: d.id,
          docType: d.doc_type,
          tranid: d.tranid,
          date: d.doc_date,
          currency: d.currency,
          totalForeign: d.total_foreign,
          totalAmount: d.total_amount,
          sales: d.sales_amount,
          supportFund: d.support_fund,
          excluded: d.excluded_amount,
          poRef: d.po_ref,
          memo: d.memo,
          soTranid: d.so_tranid,
          linkedOrderId: d.order_id,
          suggestion: statuses.get(d.id) === 'to_review' ? suggestFromNetSuite(d, linkCtx) ?? suggestTarget(d, orders, docs) : null,
          creditedInvoices: d.credited_invoice_tranids ?? [],
          status: statuses.get(d.id),
          review: r
            ? {
                decision: r.decision,
                orderId: r.order_id,
                attachedDocumentId: r.attached_document_id,
                reason: r.reason,
                decidedBy: r.decided_by ? names.get(r.decided_by) ?? 'Admin' : null,
                decidedAt: r.decided_at,
              }
            : null,
          creditsAttached: credits?.amount ?? 0,
          lines: d.lines ?? [],
        };
      }),
      attachTargets: {
        orders: orders
          .filter((o) => o.status !== 'Draft' && o.status !== 'Cancelled')
          .map((o) => ({ id: o.id, poNumber: o.po_number, status: o.status, total: Number(o.total_value) || 0, createdAt: o.created_at })),
        outsideSales: docs
          .filter((d) => reviews.get(d.id)?.decision === 'outside_sale')
          .map((d) => ({ id: d.id, tranid: d.tranid, date: d.doc_date, sales: d.sales_amount })),
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err?.message || 'Failed to load the NetSuite review.' }, { status: 500 });
  }
}
