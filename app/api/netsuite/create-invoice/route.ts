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
      .select('id, status, netsuite_so_id, netsuite_invoice_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!order.netsuite_so_id) {
      return NextResponse.json(
        { error: 'No NetSuite Sales Order linked to this order. Push to NetSuite first.' },
        { status: 400 }
      );
    }

    if (order.netsuite_invoice_id) {
      return NextResponse.json(
        { error: 'An invoice already exists for this order (ID: ' + order.netsuite_invoice_id + ').' },
        { status: 409 }
      );
    }

    const ns = createNetSuiteAPI();
    let result;
    try {
      result = await ns.createInvoiceFromSO(order.netsuite_so_id);
    } catch (e: any) {
      // If the SO no longer exists in NS (e.g. deleted manually), clear the stale
      // link so the admin can push the order to NetSuite again.
      if (e?.message?.includes('NetSuite 404')) {
        await supabase
          .from('orders')
          .update({ netsuite_so_id: null, so_number: null })
          .eq('id', orderId);
        return NextResponse.json(
          {
            error:
              'The Sales Order no longer exists in NetSuite. The link has been cleared — refresh the page and click "Push to NetSuite" to recreate it.',
          },
          { status: 410 }
        );
      }
      throw e;
    }

    await supabase
      .from('orders')
      .update({
        netsuite_invoice_id: result.nsInvoiceId,
        invoice_number: result.invoiceNumber,
        netsuite_invoice_date: result.invoiceDate,
        netsuite_invoice_status: result.status,
        invoice_amount_remaining: result.amountRemaining,
        invoice_due_date: result.dueDate,
        status: 'Ready',
      })
      .eq('id', orderId);

    await supabase.from('order_history').insert([{
      order_id: orderId,
      status_from: order.status,
      status_to: 'Ready',
      notes: `NetSuite Invoice created: ${result.invoiceNumber}`,
      changed_by_name: 'System',
      changed_by_role: 'admin',
    }]);

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('create-invoice error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create NetSuite invoice' }, { status: 500 });
  }
}
