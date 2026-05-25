import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdmin,
} from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';

/**
 * POST /api/netsuite/reconcile-order
 * Body: { orderId: string }
 *
 * Lazy-hydrates NetSuite linkage on an order. The Hub historically allowed
 * admins to enter a NetSuite SO number manually (so_number) without ever
 * pushing through the Hub integration. Those orders kept showing the
 * "Push to NetSuite" button forever even when the SO actually existed in NS.
 *
 * Behavior:
 *   - If netsuite_so_id already set → no-op (nothing to reconcile).
 *   - Else if so_number is set → look up the SO in NS by tranid.
 *       - Found → write netsuite_so_id; then look for an invoice created from
 *         it and write netsuite_invoice_id + invoice_number +
 *         netsuite_invoice_date + netsuite_invoice_status if found.
 *       - Not found → return notFound:true. The Push button stays visible
 *         and the admin can either push or correct the so_number.
 *   - Else (no so_number) → noop:true. The Push flow is the only path.
 *
 * The response includes the updated fields so the caller can refresh its
 * local order state without a second round-trip.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required' },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        'id, so_number, netsuite_so_id, netsuite_invoice_id',
      )
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Nothing to do.
    if (order.netsuite_so_id) {
      return NextResponse.json({ noop: true, reason: 'already-linked' });
    }
    if (!order.so_number) {
      return NextResponse.json({ noop: true, reason: 'no-so-number' });
    }

    const ns = createNetSuiteAPI();

    // --- 1. Find the SO by tranid ---
    let so;
    try {
      so = await ns.findSalesOrderByTranId(order.so_number);
    } catch (e: any) {
      return NextResponse.json(
        { error: `NetSuite lookup failed: ${e?.message ?? 'unknown error'}` },
        { status: 502 },
      );
    }

    if (!so) {
      console.warn(
        `reconcile-order: SO not found in NetSuite for tranid="${order.so_number}" (orderId=${orderId})`,
      );
      return NextResponse.json({
        notFound: true,
        soNumber: order.so_number,
        message: `No Sales Order with number "${order.so_number}" exists in NetSuite. Verify the number is correct, or push this order to create the SO.`,
      });
    }

    // --- 2. Find an invoice for it (if any) ---
    let invoice = null;
    try {
      invoice = await ns.findInvoiceForSalesOrder(so.nsSOId);
    } catch (e: any) {
      // Non-fatal — we still backfill the SO link even if invoice lookup blew up.
      console.error('reconcile-order invoice lookup failed:', e?.message);
    }

    // --- 3. Write back to the orders row ---
    const patch: Record<string, unknown> = {
      netsuite_so_id: so.nsSOId,
      so_number: so.soNumber, // normalize to whatever NS canonical value is
    };
    if (invoice) {
      patch.netsuite_invoice_id = invoice.nsInvoiceId;
      patch.invoice_number = invoice.invoiceNumber;
      patch.netsuite_invoice_date = invoice.invoiceDate || null;
      patch.netsuite_invoice_status = invoice.status || null;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', orderId);

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update order: ${updateError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      reconciled: true,
      so: { nsSOId: so.nsSOId, soNumber: so.soNumber },
      invoice: invoice
        ? {
            nsInvoiceId: invoice.nsInvoiceId,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            status: invoice.status,
          }
        : null,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('reconcile-order error:', error);
    return NextResponse.json(
      { error: error.message || 'Reconciliation failed' },
      { status: 500 },
    );
  }
}
