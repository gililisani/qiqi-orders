import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';
import { getNetSuiteItem } from '../../../../lib/netsuiteItemMap';
import { createStripeClient, voidInvoice } from '../../../../lib/stripe';

/**
 * POST /api/stripe/void-payment   Body: { orderId }
 *
 * Cancels a pending card payment request: voids the Stripe invoice, removes the
 * credit-card fee line from the NetSuite invoice (no card payment → no fee;
 * shipping stays), and clears the order's Stripe fields. Blocked once paid.
 * After this the "Send for Payment" button returns (reissue).
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'orders:edit');
    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, payment_status, stripe_invoice_id, netsuite_invoice_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.payment_status === 'paid') {
      return NextResponse.json({ error: 'This order is paid — the payment cannot be voided here.' }, { status: 409 });
    }
    if (!order.stripe_invoice_id) {
      return NextResponse.json({ error: 'No pending Stripe payment to void.' }, { status: 400 });
    }

    // Ask Stripe for the invoice's REAL status first. Our local paid-check
    // above can race the webhook: if the client paid seconds ago, voiding is
    // impossible and clearing stripe_invoice_id below would orphan the
    // payment (the webhook matches orders by that id — it could never mark
    // this order paid).
    const stripe = createStripeClient();
    const stripeInvoice = await stripe.invoices.retrieve(order.stripe_invoice_id);
    if (stripeInvoice.status === 'paid') {
      return NextResponse.json(
        {
          error:
            'Stripe reports this invoice as already PAID — it cannot be voided. ' +
            'The payment will sync to the order shortly; refresh in a minute.',
        },
        { status: 409 },
      );
    }

    // Void unless Stripe says it's already void. On failure, change NOTHING
    // locally — a cleared local state with a live open invoice means the
    // client can still pay an invoice we no longer track.
    if (stripeInvoice.status !== 'void') {
      try {
        await voidInvoice(stripe, order.stripe_invoice_id);
      } catch (e: any) {
        console.error('void-payment: Stripe void failed:', e?.message);
        return NextResponse.json(
          { error: `Stripe void failed: ${e?.message}. Nothing was changed — try again.` },
          { status: 502 },
        );
      }
    }

    // Remove the card-fee line from the NetSuite invoice + refresh totals.
    const patch: Record<string, unknown> = {
      stripe_invoice_id: null,
      stripe_invoice_number: null,
      stripe_hosted_url: null,
      payment_status: null,
    };
    if (order.netsuite_invoice_id) {
      try {
        const ns = createNetSuiteAPI();
        const feeItem = await getNetSuiteItem(supabase, 'cc_processing_fee');
        await ns.removeInvoiceChargeLine(order.netsuite_invoice_id, feeItem.nsId);
        const details = await ns.getInvoiceDetails(order.netsuite_invoice_id);
        patch.invoice_amount_remaining = details.amountRemaining;
        if (details.status) patch.netsuite_invoice_status = details.status;
      } catch (e: any) {
        console.error('void-payment: NetSuite fee removal failed:', e?.message);
      }
    }

    const { error: updateErr } = await supabase.from('orders').update(patch).eq('id', orderId);
    if (updateErr) {
      console.error('void-payment: local update failed after Stripe void:', updateErr.message);
      return NextResponse.json(
        {
          error:
            `The Stripe invoice was voided but updating the order failed (${updateErr.message}). ` +
            'Click Void again to finish clearing the order.',
        },
        { status: 500 },
      );
    }

    await supabase.from('order_history').insert([{
      action_type: 'order_updated',
      order_id: orderId,
      status_from: order.status,
      status_to: order.status,
      notes: 'Stripe payment request voided (card fee removed from the NetSuite invoice).',
      changed_by_name: 'System',
      changed_by_role: 'admin',
    }]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('void-payment error:', error);
    return NextResponse.json({ error: error.message || 'Failed to void payment' }, { status: 500 });
  }
}
