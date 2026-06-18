import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { createStripeClient } from '../../../../lib/stripe';
import { createNetSuiteAPI } from '../../../../lib/netsuite';
import { getNetSuiteItem } from '../../../../lib/netsuiteItemMap';

/**
 * POST /api/stripe/webhook
 *
 * Stripe calls this when an invoice is paid. We verify the signature with
 * STRIPE_WEBHOOK_SECRET, then flip the matching order to paid. No auth guard —
 * authenticity comes from the signature, not a session.
 *
 * Configure in Stripe: Developers → Webhooks → add endpoint
 *   https://<app>/api/stripe/webhook  → event: invoice.paid
 * then copy the signing secret into STRIPE_WEBHOOK_SECRET.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('stripe webhook: STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // Raw body is required for signature verification.
  const rawBody = await request.text();
  const stripe = createStripeClient();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err: any) {
    console.error('stripe webhook: signature verification failed:', err?.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // We only act on a paid invoice. (invoice.payment_succeeded covers the same.)
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as { id?: string };
    const stripeInvoiceId = invoice.id;
    if (stripeInvoiceId) {
      try {
        const supabase = createServiceRoleClient();
        const { data: order } = await supabase
          .from('orders')
          .select('id, status, payment_status, netsuite_invoice_id, ns_customer_payment_id')
          .eq('stripe_invoice_id', stripeInvoiceId)
          .maybeSingle();

        // Idempotent: ignore if unknown or already paid.
        if (order && order.payment_status !== 'paid') {
          // Phase 2: record a NetSuite Customer Payment against the invoice so
          // NS AR shows it paid. Non-fatal — the Stripe money is real regardless;
          // a failure just means the owner records it manually (we note that).
          // Guarded by ns_customer_payment_id so a retry can't double-record.
          let nsPaymentId: string | null = order.ns_customer_payment_id ?? null;
          let nsNote = '';
          if (order.netsuite_invoice_id && !nsPaymentId) {
            try {
              const ns = createNetSuiteAPI();
              const account = await getNetSuiteItem(supabase, 'stripe_deposit_account');
              const { paymentId } = await ns.recordCustomerPayment(order.netsuite_invoice_id, account.nsId);
              nsPaymentId = paymentId;
              nsNote = ` NetSuite payment ${paymentId} recorded.`;
            } catch (e: any) {
              console.error('stripe webhook: NetSuite payment recording failed:', e?.message);
              nsNote = ' ⚠️ NetSuite payment NOT recorded — record it manually.';
            }
          }

          await supabase
            .from('orders')
            .update({
              payment_status: 'paid',
              paid_at: new Date().toISOString(),
              invoice_amount_remaining: 0,
              ns_customer_payment_id: nsPaymentId,
            })
            .eq('id', order.id);

          await supabase.from('order_history').insert([{
            action_type: 'order_updated',
            order_id: order.id,
            status_from: order.status,
            status_to: order.status,
            notes: `Credit card payment received (Stripe). Order is Paid in Full.${nsNote}`,
            changed_by_name: 'System',
            changed_by_role: 'admin',
          }]);
        }
      } catch (e: any) {
        // Log and still 200 — Stripe retries on non-2xx; a DB hiccup shouldn't
        // cause endless retries once the row is actually updated. But a true
        // failure before the update means we DO want a retry, so return 500.
        console.error('stripe webhook: failed to mark order paid:', e?.message);
        return NextResponse.json({ error: 'processing failed' }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
