import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { getFulfillmentProvider } from '../../../../lib/fulfillment';
import { runFulfillmentAutomation } from '../../../../lib/fulfillment/orderAutomation';

/**
 * Every 15 minutes (vercel.json): the fulfillment return path.
 *
 * For each order that has been sent to the warehouse and isn't Done yet:
 *   1. pull the current state from ShipHero (shipments + order_history) and
 *      record the normalized fulfillment_status — this is the safety net for
 *      missed webhooks, and the webhook handler records the same field, so
 *      both signals converge here;
 *   2. run the automation on the recorded state:
 *        packed  → NetSuite invoice + status Ready + "ready for pickup" email
 *        closed out (their post-pickup step) → status Done.
 *
 * Every step is idempotent (atomic status claims, detect-first invoicing), so
 * overlapping runs and webhook/cron races are safe.
 */

// Route-level export — vercel.json "functions.maxDuration" is NOT honored for
// App Router routes (see docs/SYNC-ISSUES: the 60s-kill incident).
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const BATCH_LIMIT = 40;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (!process.env.SHIPHERO_REFRESH_TOKEN) {
      // Staging has no ShipHero on purpose — succeed quietly.
      return NextResponse.json({ success: true, skipped: 'ShipHero not configured' });
    }
    const allowInvoice = !!process.env.NETSUITE_ACCOUNT_ID;

    const supabase = createServiceRoleClient();

    const { data: orders, error } = await supabase
      .from('orders')
      .select(
        'id, status, company_id, fulfillment_status, fulfillment_synced_at, netsuite_so_id, netsuite_invoice_id, external_fulfillment_id, tracking_number',
      )
      .eq('fulfillment_provider', 'shiphero')
      .not('external_fulfillment_id', 'is', null)
      .in('status', ['In Process', 'Ready'])
      .order('fulfillment_synced_at', { ascending: true, nullsFirst: true })
      .limit(BATCH_LIMIT);
    if (error) throw new Error(`candidate query: ${error.message}`);

    if (!orders || orders.length === 0) {
      return NextResponse.json({ success: true, polled: 0, actions: [] });
    }

    const provider = getFulfillmentProvider('shiphero');
    const results: Array<{ orderId: string; fulfillment: string | null; actions: string[]; error?: string }> = [];

    for (const order of orders) {
      try {
        // 1. Pull + record current warehouse state.
        if (provider.getFulfillment) {
          const snap = await provider.getFulfillment(order.external_fulfillment_id!);
          if (snap.status !== 'unknown' && snap.status !== order.fulfillment_status) {
            const { error: updateErr } = await supabase
              .from('orders')
              .update({
                fulfillment_status: snap.status,
                fulfillment_synced_at: new Date().toISOString(),
                // Never wipe tracking an earlier event set.
                ...(snap.trackingNumber
                  ? { tracking_number: snap.trackingNumber, tracking_carrier: snap.carrier ?? null }
                  : {}),
              })
              .eq('id', order.id);
            if (updateErr) throw new Error(`state write: ${updateErr.message}`);
            order.fulfillment_status = snap.status;
          } else {
            // Mark polled so the batch rotates through all candidates.
            await supabase
              .from('orders')
              .update({ fulfillment_synced_at: new Date().toISOString() })
              .eq('id', order.id);
          }
        }

        // 2. Automation from the recorded state.
        const actions = await runFulfillmentAutomation(supabase, order, { allowInvoice });
        results.push({ orderId: order.id, fulfillment: order.fulfillment_status, actions });
      } catch (e: any) {
        console.error(`[cron/fulfillment-poll] order ${order.id} failed:`, e?.message);
        results.push({ orderId: order.id, fulfillment: order.fulfillment_status, actions: [], error: e?.message });
      }
    }

    const acted = results.filter((r) => r.actions.length > 0);
    const failed = results.filter((r) => r.error);
    console.log(
      `[cron/fulfillment-poll] polled ${results.length} orders; ${acted.length} acted on; ${failed.length} failed`,
      acted.length ? JSON.stringify(acted) : '',
    );

    return NextResponse.json({
      success: true,
      polled: results.length,
      acted,
      failures: failed.slice(0, 10),
    });
  } catch (err: any) {
    console.error('[cron/fulfillment-poll] error:', err);
    return NextResponse.json({ error: err?.message || 'Fulfillment poll failed' }, { status: 500 });
  }
}
