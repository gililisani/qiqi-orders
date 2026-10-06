import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { reconcileCompany } from '../../../../../lib/salesLedger/reconcile';

/**
 * One company's sales ledger next to its Hub orders (distributors:view):
 * documents with their lines, each Hub order's billing state, totals, and
 * the sync status. Read-only.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    await requireAdminWithPermission(request, 'distributors:view');
    const supabase = createServiceRoleClient();

    const [companyRes, ordersRes, docsRes, syncRes, settingsRes] = await Promise.all([
      supabase
        .from('companies')
        .select('id, company_name, netsuite_number, netsuite_internal_id, contract_execution_date')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('orders')
        .select('id, po_number, status, total_value, created_at')
        .eq('company_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('sales_documents')
        .select(
          'id, doc_type, tranid, doc_date, currency, total_foreign, total_amount, sales_amount, excluded_amount, support_fund, order_id, po_ref, memo, so_tranid, netsuite_id, ' +
            'lines:sales_document_lines(line_no, kind, sku, item_name, quantity, amount)'
        )
        .eq('company_id', id)
        .order('doc_date', { ascending: false })
        .range(0, 4999),
      supabase.from('sales_company_sync').select('*').eq('company_id', id).maybeSingle(),
      supabase.from('sales_settings').select('history_start_date').eq('id', 1).maybeSingle(),
    ]);
    for (const r of [companyRes, ordersRes, docsRes, syncRes, settingsRes]) {
      if (r.error) throw new Error(r.error.message);
    }
    if (!companyRes.data) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const documents = (docsRes.data ?? []) as any[];
    const recon = reconcileCompany({
      contractDate: companyRes.data.contract_execution_date ?? null,
      orders: (ordersRes.data ?? []) as any[],
      documents: documents.map((d) => ({
        ...d,
        sales_amount: Number(d.sales_amount),
        support_fund: Number(d.support_fund),
        excluded_amount: Number(d.excluded_amount),
      })),
    });
    const extraById = new Map(documents.map((d) => [d.id, d]));

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
      totals: recon.totals,
      orders: recon.orders,
      documents: recon.documents.map((d) => {
        const raw = extraById.get(d.id);
        return {
          ...d,
          netsuiteId: raw?.netsuite_id ?? null,
          totalForeign: Number(raw?.total_foreign ?? 0),
          totalAmount: Number(raw?.total_amount ?? 0),
          lines: ((raw?.lines ?? []) as any[]).sort((a, b) => a.line_no - b.line_no),
        };
      }),
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err?.message || 'Failed to load the sales ledger.' }, { status: 500 });
  }
}
