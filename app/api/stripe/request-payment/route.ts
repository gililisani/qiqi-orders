import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';
import { getNetSuiteItem } from '../../../../lib/netsuiteItemMap';
import { createStripeClient, ensureCustomer, createOrderInvoice, sendInvoiceEmail, toCents } from '../../../../lib/stripe';

/**
 * POST /api/stripe/request-payment   Body: { orderId }
 *
 * Admin "Send for Payment". Creates the NetSuite invoice (with shipping + the
 * per-company credit-card fee line) AND a Stripe invoice charged for the exact
 * NetSuite invoice total, then emails the client the hosted Pay-Now link.
 *
 * The Stripe charge is ANCHORED to the NetSuite invoice total so the two can
 * never drift: lines = [goods = NS total − shipping − fee, shipping, fee].
 *
 * Idempotent: if a pending Stripe invoice already exists, returns it. Blocked
 * once paid.
 */
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
      .select(`
        id, po_number, status, total_value, shipping_amount,
        netsuite_so_id, netsuite_invoice_id, stripe_invoice_id, stripe_hosted_url, payment_status,
        company:companies(
          id, company_name, company_email,
          enable_credit_card_payments, credit_card_fee_percent, stripe_customer_id
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const company: any = order.company;

    if (!company?.enable_credit_card_payments) {
      return NextResponse.json(
        { error: 'Credit card payments are not enabled for this company.' },
        { status: 400 },
      );
    }
    if (!order.netsuite_so_id) {
      return NextResponse.json(
        { error: 'Push the order to NetSuite first — a Sales Order is required.' },
        { status: 400 },
      );
    }
    if (order.payment_status === 'paid') {
      return NextResponse.json({ error: 'This order is already paid.' }, { status: 409 });
    }
    // Idempotent: a pending request already exists → return it.
    if (order.stripe_invoice_id && order.payment_status === 'pending') {
      return NextResponse.json({
        success: true,
        alreadyPending: true,
        hostedUrl: order.stripe_hosted_url,
      });
    }

    const ns = createNetSuiteAPI();

    // --- 0. Validate the cached NetSuite links still exist (records can be
    // deleted directly in NetSuite, leaving the Hub pointing at a ghost). ---
    if (!(await ns.recordExists('salesOrder', order.netsuite_so_id))) {
      // SO is gone — clear the whole NS link so the admin can re-push cleanly.
      await supabase
        .from('orders')
        .update({
          netsuite_so_id: null,
          so_number: null,
          netsuite_invoice_id: null,
          invoice_number: null,
          netsuite_invoice_status: null,
          invoice_amount_remaining: null,
          invoice_due_date: null,
        })
        .eq('id', orderId);
      return NextResponse.json(
        {
          error:
            'The NetSuite Sales Order for this order no longer exists (it was deleted in NetSuite). The link has been cleared — refresh the page, click "Push to NetSuite" to recreate the SO, then Send for Payment again.',
        },
        { status: 409 },
      );
    }
    // If an invoice link is cached but the invoice was deleted in NS, drop it so
    // we recreate a fresh one below instead of failing on a ghost reference.
    if (order.netsuite_invoice_id && !(await ns.recordExists('invoice', order.netsuite_invoice_id))) {
      order.netsuite_invoice_id = null;
      await supabase.from('orders').update({ netsuite_invoice_id: null }).eq('id', orderId);
    }

    const shipItem = await getNetSuiteItem(supabase, 'shipping');
    const feeItem = await getNetSuiteItem(supabase, 'cc_processing_fee');

    // --- 1. Resolve or create the NetSuite invoice ---
    let nsInvoiceId = order.netsuite_invoice_id as string | null;
    if (!nsInvoiceId) {
      const existing = await ns.findInvoiceForSalesOrder(order.netsuite_so_id);
      nsInvoiceId = existing
        ? existing.nsInvoiceId
        : (await ns.createInvoiceFromSO(order.netsuite_so_id)).nsInvoiceId;
    }

    // --- 2. Ensure shipping + fee lines on the invoice ---
    const shippingAmt = order.shipping_amount || 0;
    if (shippingAmt > 0) {
      await ns.upsertInvoiceChargeLine(nsInvoiceId, shipItem.nsId, shippingAmt);
    }
    const feePercent = Number(company.credit_card_fee_percent) || 0;
    const feeBase = (order.total_value || 0) + shippingAmt;
    const feeCents = Math.round(feeBase * feePercent); // feeBase($) * pct = cents of feeBase*pct/100
    const fee = feeCents / 100;
    if (fee > 0) {
      await ns.upsertInvoiceChargeLine(nsInvoiceId, feeItem.nsId, fee);
    }

    // --- 3. Authoritative total from NetSuite (fresh invoice → amountRemaining = total) ---
    const details = await ns.getInvoiceDetails(nsInvoiceId);
    const nsTotal = details.amountRemaining ?? feeBase + fee; // fallback assumes no tax (export clients)

    // --- 4. Stripe customer (cache on company) ---
    const stripe = createStripeClient();
    const customerId = await ensureCustomer(stripe, {
      existingId: company.stripe_customer_id,
      name: company.company_name,
      email: company.company_email,
      metadata: { company_id: company.id },
    });
    if (customerId !== company.stripe_customer_id) {
      await supabase.from('companies').update({ stripe_customer_id: customerId }).eq('id', company.id);
    }

    // --- 5. Stripe invoice anchored to the NS total ---
    const totalCents = toCents(nsTotal);
    const shippingCents = toCents(shippingAmt);
    const goodsCents = totalCents - shippingCents - feeCents;
    const lines = [{ description: `Order ${order.po_number} — products`, amountCents: goodsCents }];
    if (shippingCents > 0) lines.push({ description: 'Shipping', amountCents: shippingCents });
    if (feeCents > 0) lines.push({ description: `Credit Card Processing Fee (${feePercent}%)`, amountCents: feeCents });

    const stripeInvoice = await createOrderInvoice(stripe, {
      customerId,
      lines,
      daysUntilDue: 2,
      description: `Qiqi Invoice ${details.invoiceNumber}`,
      metadata: { order_id: order.id, ns_invoice_id: nsInvoiceId },
    });

    // Email the hosted link to the client (non-fatal).
    try {
      await sendInvoiceEmail(stripe, stripeInvoice.invoiceId);
    } catch (e: any) {
      console.error('request-payment: sendInvoiceEmail failed:', e?.message);
    }

    // --- 6. Persist ---
    await supabase
      .from('orders')
      .update({
        netsuite_invoice_id: nsInvoiceId,
        invoice_number: details.invoiceNumber,
        netsuite_invoice_status: details.status,
        invoice_amount_remaining: details.amountRemaining,
        invoice_due_date: details.dueDate,
        stripe_invoice_id: stripeInvoice.invoiceId,
        stripe_invoice_number: stripeInvoice.number,
        stripe_hosted_url: stripeInvoice.hostedUrl,
        payment_status: 'pending',
        status: 'Ready',
      })
      .eq('id', orderId);

    await supabase.from('order_history').insert([{
      action_type: 'status_change',
      order_id: orderId,
      status_from: order.status,
      status_to: 'Ready',
      notes:
        `Sent for payment — Stripe invoice ${stripeInvoice.number} ($${nsTotal.toFixed(2)}), ` +
        `NetSuite invoice ${details.invoiceNumber} incl. ${feePercent}% card fee.`,
      changed_by_name: 'System',
      changed_by_role: 'admin',
    }]);

    return NextResponse.json({
      success: true,
      hostedUrl: stripeInvoice.hostedUrl,
      stripeNumber: stripeInvoice.number,
      nsInvoiceNumber: details.invoiceNumber,
      total: nsTotal,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('request-payment error:', error);
    return NextResponse.json({ error: error.message || 'Failed to send for payment' }, { status: 500 });
  }
}
