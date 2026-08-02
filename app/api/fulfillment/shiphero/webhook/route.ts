import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../../platform/auth/guards';
import { getFulfillmentProvider } from '../../../../../lib/fulfillment';

/**
 * POST /api/fulfillment/shiphero/webhook?token=<SHIPHERO_WEBHOOK_SECRET>
 *
 * ShipHero calls this on a Shipment Update (our "ready for pickup" / shipped
 * signal) or Order Canceled. Authenticity comes from the secret token in the
 * URL (we register the webhook with this URL), not a session — so no auth guard.
 *
 * ShipHero webhooks have a 10s timeout, 5 retries, and no SLA, so this handler
 * must be fast and idempotent: we only write when the normalized state actually
 * changes, and we return 200 for anything we've handled or chosen to ignore.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const urlToken = request.nextUrl.searchParams.get('token');

  const provider = getFulfillmentProvider('shiphero');

  // Parse + verify (returns null on bad token, bad JSON, or irrelevant payload).
  const event = provider.parseWebhook({
    rawBody,
    headers: Object.fromEntries(request.headers.entries()),
    urlToken,
  });

  if (!event) {
    // Could be a bad token or an event we don't act on — acknowledge so ShipHero
    // doesn't retry. (A bad token returning 200 avoids leaking which it was.)
    return NextResponse.json({ received: true, acted: false });
  }

  // We only change order state on shipment updates and cancellations.
  if (event.type === 'other') {
    return NextResponse.json({ received: true, acted: false });
  }

  try {
    const supabase = createServiceRoleClient();

    // Match the Hub order. partner_order_id is the Hub order UUID we sent on
    // create; fall back to the provider order id, then the human order number.
    let order: { id: string; status: string; fulfillment_status: string | null } | null = null;

    if (event.partnerOrderId) {
      const { data } = await supabase
        .from('orders')
        .select('id, status, fulfillment_status')
        .eq('id', event.partnerOrderId)
        .maybeSingle();
      order = data ?? null;
    }
    if (!order && event.externalOrderId) {
      const { data } = await supabase
        .from('orders')
        .select('id, status, fulfillment_status')
        .eq('external_fulfillment_id', event.externalOrderId)
        .maybeSingle();
      order = data ?? null;
    }
    if (!order && event.orderNumber) {
      // event.orderNumber comes straight from the webhook payload. Only
      // interpolate it into the PostgREST .or() filter when it's a plain
      // order-number shape — commas/parens would rewrite the filter itself.
      const safeOrderNumber = /^[A-Za-z0-9._-]+$/.test(event.orderNumber)
        ? event.orderNumber
        : null;
      if (safeOrderNumber) {
        const { data } = await supabase
          .from('orders')
          .select('id, status, fulfillment_status')
          .or(`so_number.eq.${safeOrderNumber},po_number.eq.${safeOrderNumber}`)
          .maybeSingle();
        order = data ?? null;
      }
    }

    if (!order) {
      // Unknown order — acknowledge (likely another brand on the 3PL account, or
      // an order not created by the Hub). Nothing to do.
      return NextResponse.json({ received: true, acted: false, reason: 'order not found' });
    }

    // Idempotent: skip if the normalized status hasn't changed.
    if (order.fulfillment_status === event.status) {
      return NextResponse.json({ received: true, acted: false, reason: 'no change' });
    }

    const { error: updateErr } = await supabase
      .from('orders')
      .update({
        fulfillment_provider: 'shiphero',
        fulfillment_status: event.status,
        fulfillment_synced_at: new Date().toISOString(),
        // Only touch tracking when the event carries it — a later event
        // without tracking must not wipe what an earlier shipment set.
        ...(event.trackingNumber
          ? { tracking_number: event.trackingNumber, tracking_carrier: event.carrier ?? null }
          : {}),
        ...(event.externalOrderId ? { external_fulfillment_id: event.externalOrderId } : {}),
      })
      .eq('id', order.id);
    if (updateErr) {
      // 500 so ShipHero retries — returning 200 on a failed write would
      // silently eat the only recovery mechanism.
      console.error('[shiphero-webhook] order update failed:', updateErr);
      return NextResponse.json({ error: 'Order update failed' }, { status: 500 });
    }

    const note =
      event.status === 'ready_for_pickup'
        ? 'Order is ready for pickup (ShipHero fulfillment, generic/wholesale carrier).'
        : event.status === 'shipped'
          ? `Order shipped (ShipHero)${event.trackingNumber ? `. Tracking ${event.trackingNumber}` : ''}.`
          : event.status === 'cancelled'
            ? 'Order cancelled in ShipHero.'
            : `Fulfillment update: ${event.status}.`;

    await supabase.from('order_history').insert([
      {
        action_type: 'order_updated',
        order_id: order.id,
        status_from: order.status,
        status_to: order.status,
        notes: note,
        changed_by_name: 'System',
        changed_by_role: 'admin',
      },
    ]);

    return NextResponse.json({ received: true, acted: true, status: event.status });
  } catch (e: any) {
    // True failure before the update — return 500 so ShipHero retries.
    console.error('shiphero webhook: failed to process:', e?.message);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
