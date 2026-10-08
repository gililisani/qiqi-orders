import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { isCredit } from '../../../../../lib/salesLedger/review';

/**
 * NetSuite documents an admin attached to a Hub order on the NetSuite
 * review page (orders:view): credits (damaged / short-shipped products —
 * never support funds) with the products credited, and invoices that bill
 * the order but weren't linked by NetSuite. Read-only.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    await requireAdminWithPermission(request, 'orders:view');
    const supabase = createServiceRoleClient();
    const { data: reviews, error } = await supabase
      .from('sales_document_reviews')
      .select('document_id, decided_at')
      .eq('decision', 'attach')
      .eq('order_id', id);
    if (error) throw new Error(error.message);
    if (!reviews?.length) return NextResponse.json({ credits: [], invoices: [] });

    const { data: docs, error: docsErr } = await supabase
      .from('sales_documents')
      .select('id, doc_type, tranid, doc_date, sales_amount, netsuite_id, lines:sales_document_lines(line_no, kind, sku, item_name, quantity, amount)')
      .in('id', reviews.map((r) => r.document_id));
    if (docsErr) throw new Error(docsErr.message);

    const shape = (d: any) => ({
      id: d.id,
      tranid: d.tranid,
      date: d.doc_date,
      amount: Number(d.sales_amount) || 0,
      netsuiteId: d.netsuite_id,
      products: ((d.lines ?? []) as any[])
        .filter((l) => l.kind === 'product')
        .sort((a, b) => a.line_no - b.line_no)
        .map((l) => ({ sku: l.sku, name: l.item_name, quantity: Number(l.quantity) || 0, amount: Number(l.amount) || 0 })),
    });
    const sorted = (docs ?? []).sort((a: any, b: any) => (a.doc_date < b.doc_date ? -1 : 1));
    return NextResponse.json({
      credits: sorted.filter((d: any) => isCredit(d.doc_type)).map(shape),
      invoices: sorted.filter((d: any) => !isCredit(d.doc_type)).map(shape),
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err?.message || 'Failed to load NetSuite credits.' }, { status: 500 });
  }
}
