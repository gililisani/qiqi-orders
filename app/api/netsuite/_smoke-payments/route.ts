import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdmin,
} from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';

/**
 * GET /api/netsuite/_smoke-payments?orderId=<uuid>
 *
 * Admin-only smoke test for the Phase 2 client-payments work.
 * Returns the raw response of getInvoicePaymentsDetailed() for the order's
 * netsuite_invoice_id, plus the invoice details and a brief envelope so
 * we can confirm the data shape before committing to the client UI.
 *
 * Will be deleted once Phase 2 ships and we've verified the response.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const orderId = new URL(request.url).searchParams.get('orderId');
    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId query param is required' },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleClient();
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        'id, po_number, so_number, invoice_number, netsuite_so_id, netsuite_invoice_id, netsuite_invoice_status, netsuite_invoice_date, total_value',
      )
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found', details: orderError?.message },
        { status: 404 },
      );
    }

    if (!order.netsuite_invoice_id) {
      return NextResponse.json({
        order,
        note: 'This order has no netsuite_invoice_id — nothing to fetch from NS.',
      });
    }

    const ns = createNetSuiteAPI();
    const startedAt = Date.now();
    const [invoice, payments] = await Promise.all([
      ns.getInvoiceDetails(order.netsuite_invoice_id),
      ns.getInvoicePaymentsDetailed(order.netsuite_invoice_id),
    ]);
    const durationMs = Date.now() - startedAt;

    const totalPaid = payments.reduce((s, p) => s + p.appliedAmount, 0);
    const balance = (Number(order.total_value) || 0) - totalPaid;

    return NextResponse.json({
      durationMs,
      order: {
        id: order.id,
        po_number: order.po_number,
        so_number: order.so_number,
        invoice_number: order.invoice_number,
        netsuite_so_id: order.netsuite_so_id,
        netsuite_invoice_id: order.netsuite_invoice_id,
        netsuite_invoice_status: order.netsuite_invoice_status,
        netsuite_invoice_date: order.netsuite_invoice_date,
        total_value: order.total_value,
      },
      invoiceFromNs: invoice,
      paymentsFromNs: payments,
      derived: {
        totalPaid,
        balance,
        paymentCount: payments.length,
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[_smoke-payments] error:', err);
    return NextResponse.json(
      { error: err.message || 'Smoke test failed' },
      { status: 500 },
    );
  }
}
