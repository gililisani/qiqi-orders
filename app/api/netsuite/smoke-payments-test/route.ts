import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdmin,
} from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';

/**
 * GET /api/netsuite/smoke-payments-test?orderId=<uuid>
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
    const nsInvoiceId = order.netsuite_invoice_id;

    // Run several diagnostic queries in parallel so we can see what NS
    // actually has linked to this invoice and why the production helper
    // returned no payments. The "right" query for this account is whichever
    // direction + type combination produces the matching payment.
    const [
      invoice,
      productionHelperResult,
      linksWhereInvoiceIsPrevious,
      linksWhereInvoiceIsNext,
      anyTxAppliedToInvoice,
    ] = await Promise.all([
      ns.getInvoiceDetails(nsInvoiceId),
      ns.getInvoicePaymentsDetailed(nsInvoiceId),
      // 1. Everything where invoice is the previousdoc (downstream)
      ns
        .suiteQL<any>(
          `SELECT nd.id, nd.tranid, nd.trandate, nd.type,
                  BUILTIN.DF(nd.status) AS status,
                  ABS(nd.foreigntotal)  AS total,
                  ntl.linktype
             FROM nexttransactionlink ntl
             JOIN transaction nd ON nd.id = ntl.nextdoc
            WHERE ntl.previousdoc = ${nsInvoiceId}`,
        )
        .catch((e: any) => ({ error: e.message })),
      // 2. Everything where invoice is the nextdoc (upstream / applying TO it)
      //    Drops foreignamount (doesn't exist on this account's NextTransactionLink).
      ns
        .suiteQL<any>(
          `SELECT pd.id, pd.tranid, pd.trandate, pd.type,
                  BUILTIN.DF(pd.status) AS status,
                  ABS(pd.foreigntotal)  AS total,
                  ntl.linktype
             FROM nexttransactionlink ntl
             JOIN transaction pd ON pd.id = ntl.previousdoc
            WHERE ntl.nextdoc = ${nsInvoiceId}`,
        )
        .catch((e: any) => ({ error: e.message })),
      // 3. (placeholder — dropped, transactionline.linkedtransaction doesn't exist here)
      Promise.resolve({ note: 'Skipped — column not available on this account.' }),
    ]);
    const durationMs = Date.now() - startedAt;

    const totalPaid = productionHelperResult.reduce(
      (s: number, p: any) => s + (p.paymentTotal || 0),
      0,
    );
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
      productionHelperResult,
      derived: {
        totalPaid,
        balance,
        paymentCount: productionHelperResult.length,
      },
      diagnostics: {
        explanation:
          'These three queries probe different places NetSuite might record the payment-to-invoice link. Whichever one returns the actual payment is the right linkage for this account.',
        linksWhereInvoiceIsPrevious_downstream: linksWhereInvoiceIsPrevious,
        linksWhereInvoiceIsNext_upstream: linksWhereInvoiceIsNext,
        transactionLinesReferencingInvoice: anyTxAppliedToInvoice,
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
