/**
 * GET /api/orders/[id]/invoice-pdf — the order's NetSuite invoice as a PDF.
 *
 * Billing Phase B: the document is rendered INSIDE NetSuite by the invoice-pdf
 * RESTlet (account's own Advanced PDF/HTML template — remittance, bank details,
 * everything), and this route only transports the bytes. No caching: the PDF is
 * rendered fresh so post-creation changes (e.g. Stripe shipping/fee lines)
 * always show.
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

    // Each download renders a PDF inside NetSuite — cap per actor.
    const limit = await enforceRateLimit(supabase, {
      key: `invoice-pdf:actor:${user.id}`,
      limit: INVOICE_PDF_ACTOR_RATE.limit,
      windowSeconds: INVOICE_PDF_ACTOR_RATE.windowSeconds,
    });
    if (!limit.ok) return limit.response;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, company_id, netsuite_invoice_id, invoice_number')
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

    if (!order.netsuite_invoice_id) {
      return NextResponse.json(
        { error: 'This order has no invoice yet.' },
        { status: 404 }
      );
    }

    // Env check BEFORE createNetSuiteAPI — the factory throws when NetSuite
    // isn't configured (deliberately the case on staging), and that should be
    // a friendly 503, not a generic 500.
    if (
      !process.env.NETSUITE_ACCOUNT_ID ||
      !process.env.NETSUITE_INVPDF_SCRIPT_ID ||
      !process.env.NETSUITE_INVPDF_DEPLOY_ID
    ) {
      return NextResponse.json(
        { error: 'Invoice downloads are not available right now.' },
        { status: 503 }
      );
    }

    const ns = createNetSuiteAPI();
    const { fileName, pdf } = await ns.getInvoicePdf(order.netsuite_invoice_id);
    const safeName = sanitizeContentDispositionFilename(
      fileName,
      `Invoice-${sanitizeContentDispositionFilename(order.invoice_number, order.id)}.pdf`
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
    console.error('Error in /api/orders/[id]/invoice-pdf:', error);
    return NextResponse.json(
      { error: 'Failed to fetch the invoice PDF. Please try again.' },
      { status: 500 }
    );
  }
}
