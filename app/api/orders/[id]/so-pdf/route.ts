/**
 * GET /api/orders/[id]/so-pdf — the order's NetSuite Sales Order as a PDF.
 *
 * Companion to invoice-pdf/payment-pdf: rendered INSIDE NetSuite by the same
 * RESTlet with the account's own template; this route only transports bytes.
 * Partners use it for customs paperwork (ExWorks shipments).
 *
 * Admin: any order. Client: own-company orders only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAnyRole } from '../../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../../lib/netsuite';
import { sanitizeContentDispositionFilename } from '../../../../../lib/htmlEscape';
import { enforceRateLimit, INVOICE_PDF_ACTOR_RATE } from '../../../../../platform/rateLimit';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireAnyRole(request, ['admin', 'client']);
    const orderId = params.id;
    if (!orderId) {
      return NextResponse.json({ error: 'Missing order id' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Shared budget with the other document downloads.
    const limit = await enforceRateLimit(supabase, {
      key: `invoice-pdf:actor:${user.id}`,
      limit: INVOICE_PDF_ACTOR_RATE.limit,
      windowSeconds: INVOICE_PDF_ACTOR_RATE.windowSeconds,
    });
    if (!limit.ok) return limit.response;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, company_id, netsuite_so_id, so_number')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!user.roles.includes('admin')) {
      const { data: clientRow } = await supabase
        .from('clients')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();
      if (!clientRow || clientRow.company_id !== order.company_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    if (!order.netsuite_so_id) {
      return NextResponse.json(
        { error: 'This order has no Sales Order in our system yet.' },
        { status: 404 }
      );
    }

    if (
      !process.env.NETSUITE_ACCOUNT_ID ||
      !process.env.NETSUITE_INVPDF_SCRIPT_ID ||
      !process.env.NETSUITE_INVPDF_DEPLOY_ID
    ) {
      return NextResponse.json(
        { error: 'Document downloads are not available right now.' },
        { status: 503 }
      );
    }

    const ns = createNetSuiteAPI();
    let fileName: string;
    let pdf: Buffer;
    try {
      ({ fileName, pdf } = await ns.getSalesOrderPdf(order.netsuite_so_id));
    } catch (e: any) {
      if (String(e?.message || '').includes('RENDER_FAILED')) {
        console.error('SO render failed:', e?.message);
        return NextResponse.json(
          { error: 'The Sales Order document is not available. Contact billing@qiqiglobal.com if you need it.' },
          { status: 404 }
        );
      }
      throw e;
    }

    const safeName = sanitizeContentDispositionFilename(
      fileName,
      `SalesOrder-${sanitizeContentDispositionFilename(order.so_number, order.id)}.pdf`
    );

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error in /api/orders/[id]/so-pdf:', error);
    return NextResponse.json(
      { error: 'Failed to fetch the Sales Order PDF. Please try again.' },
      { status: 500 }
    );
  }
}
