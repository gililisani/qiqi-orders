import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, netsuite_invoice_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!order.netsuite_invoice_id) {
      return NextResponse.json({ error: 'No invoice linked to this order.' }, { status: 400 });
    }

    const ns = createNetSuiteAPI();
    const result = await ns.getInvoiceDetails(order.netsuite_invoice_id);

    await supabase
      .from('orders')
      .update({
        invoice_number: result.invoiceNumber,
        netsuite_invoice_date: result.invoiceDate,
        netsuite_invoice_status: result.status,
      })
      .eq('id', orderId);

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('sync-invoice error:', error);
    return NextResponse.json({ error: error.message || 'Failed to sync invoice' }, { status: 500 });
  }
}
