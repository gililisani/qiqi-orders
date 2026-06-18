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
 *   - If netsuite_so_id AND netsuite_invoice_id both set → no-op (fully synced).
 *   - Else if netsuite_so_id set but no invoice yet → look for an invoice
 *     created from the SO in NetSuite (e.g. transformed directly in NS, not
 *     via the Hub). Found → cache the invoice fields and advance In Process →
 *     Ready. Not found → noop (the invoice simply doesn't exist yet). This is
 *     the lazy, on-view detection of NS-created invoices — one cheap SuiteQL,
 *     and only while the invoice is still unknown.
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

/**
 * Build the orders-table patch for a detected invoice. The SuiteQL finder
 * gives us id/number/date/status; we hit the REST record endpoint for
 * amountRemaining + dueDate (and prefer its date/status when present).
 * The enrichment is non-fatal — we still cache the basic fields on failure.
 */
async function buildInvoicePatch(
  ns: ReturnType<typeof createNetSuiteAPI>,
  invoice: NonNullable<Awaited<ReturnType<ReturnType<typeof createNetSuiteAPI>['findInvoiceForSalesOrder']>>>,
): Promise<Record<string, unknown>> {
  const patch: Record<string, unknown> = {
    netsuite_invoice_id: invoice.nsInvoiceId,
    invoice_number: invoice.invoiceNumber,
    netsuite_invoice_date: invoice.invoiceDate || null,
    netsuite_invoice_status: invoice.status || null,
  };
  try {
    const full = await ns.getInvoiceDetails(invoice.nsInvoiceId);
    patch.invoice_amount_remaining = full.amountRemaining;
    patch.invoice_due_date = full.dueDate;
    if (full.invoiceDate) patch.netsuite_invoice_date = full.invoiceDate;
    if (full.status) patch.netsuite_invoice_status = full.status;
  } catch (e: any) {
    console.error('reconcile-order: getInvoiceDetails post-fetch failed:', e?.message);
  }
  return patch;
}
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
        'id, status, so_number, netsuite_so_id, netsuite_invoice_id',
      )
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const ns = createNetSuiteAPI();

    // ========================================================================
    // Case A: SO already linked.
    // ========================================================================
    if (order.netsuite_so_id) {
      // Fully synced — nothing to reconcile.
      if (order.netsuite_invoice_id) {
        return NextResponse.json({ noop: true, reason: 'already-linked' });
      }

      // SO known but no invoice cached yet. Detect an invoice created from the
      // SO directly in NetSuite (one cheap SuiteQL). This is the lazy, on-view
      // sync of NS-created invoices — fires at most once per order-open while
      // the invoice is still unknown, then never again once cached.
      let invoice;
      try {
        invoice = await ns.findInvoiceForSalesOrder(order.netsuite_so_id);
      } catch (e: any) {
        return NextResponse.json(
          { error: `NetSuite invoice lookup failed: ${e?.message ?? 'unknown error'}` },
          { status: 502 },
        );
      }

      if (!invoice) {
        // No invoice exists in NetSuite yet — silent no-op.
        return NextResponse.json({ noop: true, reason: 'no-invoice-yet' });
      }

      const patch = await buildInvoicePatch(ns, invoice);
      // An order with an invoice is "Ready". Only advance from In Process so we
      // never move a Done/Cancelled order backwards.
      const advanceToReady = order.status === 'In Process';
      if (advanceToReady) patch.status = 'Ready';

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

      if (advanceToReady) {
        await supabase.from('order_history').insert([{
          action_type: 'status_change',
          order_id: orderId,
          status_from: order.status,
          status_to: 'Ready',
          notes: `NetSuite Invoice detected (created in NetSuite): ${invoice.invoiceNumber}`,
          changed_by_name: 'System',
          changed_by_role: 'admin',
        }]);
      }

      return NextResponse.json({
        reconciled: true,
        so: null,
        invoice: {
          nsInvoiceId: invoice.nsInvoiceId,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          status: invoice.status,
        },
      });
    }

    // ========================================================================
    // Case B: legacy — only a manually-entered so_number, no netsuite_so_id.
    // ========================================================================
    if (!order.so_number) {
      return NextResponse.json({ noop: true, reason: 'no-so-number' });
    }

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
      Object.assign(patch, await buildInvoicePatch(ns, invoice));
    }

    const advanceToReady = !!invoice && order.status === 'In Process';
    if (advanceToReady) patch.status = 'Ready';

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

    if (advanceToReady) {
      await supabase.from('order_history').insert([{
        action_type: 'status_change',
        order_id: orderId,
        status_from: order.status,
        status_to: 'Ready',
        notes: `NetSuite Invoice detected (created in NetSuite): ${invoice!.invoiceNumber}`,
        changed_by_name: 'System',
        changed_by_role: 'admin',
      }]);
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
