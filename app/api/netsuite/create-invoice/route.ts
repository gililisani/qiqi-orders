import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';
import { getNetSuiteItem } from '../../../../lib/netsuiteItemMap';

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
      .select('id, status, netsuite_so_id, netsuite_invoice_id, shipping_amount')
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

    // DETECT-FIRST: an invoice may already exist in NetSuite for this SO —
    // created directly in NS (not via the Hub), or by a prior partial run.
    // If so, link to it instead of transforming the SO again, which would
    // create a DUPLICATE invoice. This is the invoice analogue of the
    // externalId guard that prevents duplicate Sales Orders.
    let result;
    let linked = false;
    let existing = null;
    try {
      existing = await ns.findInvoiceForSalesOrder(order.netsuite_so_id);
    } catch (e: any) {
      // Non-fatal — fall through to create. Worst case we attempt a transform.
      console.error('create-invoice: existing-invoice lookup failed:', e?.message);
    }

    if (existing) {
      linked = true;
      // findInvoiceForSalesOrder returns null amountRemaining/dueDate; enrich
      // via the REST record. Non-fatal — fall back to the basic fields.
      try {
        result = await ns.getInvoiceDetails(existing.nsInvoiceId);
      } catch (e: any) {
        console.error('create-invoice: getInvoiceDetails failed for existing invoice:', e?.message);
        result = existing;
      }
    } else {
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
    }

    // Add the shipping line to a freshly-created invoice (shipping lives on the
    // invoice, never the SO). Skip for a linked existing invoice — its lines
    // already reflect whatever was set in NetSuite. Non-fatal: a failure here
    // shouldn't discard the just-created invoice; admin can re-apply shipping.
    if (!linked && order.shipping_amount && order.shipping_amount > 0) {
      try {
        const ship = await getNetSuiteItem(supabase, 'shipping');
        await ns.upsertInvoiceChargeLine(result.nsInvoiceId, ship.nsId, order.shipping_amount);
        result = await ns.getInvoiceDetails(result.nsInvoiceId); // refresh totals w/ shipping
      } catch (e: any) {
        console.error('create-invoice: failed to add shipping line:', e?.message);
      }
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
      action_type: 'status_change',
      order_id: orderId,
      status_from: order.status,
      status_to: 'Ready',
      notes: linked
        ? `NetSuite Invoice linked (already existed in NetSuite): ${result.invoiceNumber}`
        : `NetSuite Invoice created: ${result.invoiceNumber}`,
      changed_by_name: 'System',
      changed_by_role: 'admin',
    }]);

    return NextResponse.json({ success: true, linked, ...result });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('create-invoice error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create NetSuite invoice' }, { status: 500 });
  }
}
