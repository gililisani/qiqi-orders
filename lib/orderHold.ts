import type { SupabaseClient } from '@supabase/supabase-js';
import { sendMail } from './emailService';
import { paymentHoldReleasedTemplate, type HoldReleaseOutcome } from './emailTemplates';
import { pushOrderToWarehouse } from './fulfillment/pushOrder';

/**
 * Payment-hold auto-release (status/badge redesign, owner spec 2026-09-06).
 *
 * Called from the two places a payment can land without an admin looking at
 * the order: the Stripe invoice.paid webhook and the nightly NetSuite invoice
 * sync. If the order carries a payment hold:
 *
 *   1. clear it atomically (concurrent callers act at most once),
 *   2. AUTO-PUSH to ShipHero when the order has an SO and no live warehouse
 *      order — setting the hold WAS the human decision "ship the moment the
 *      money clears", so the automation just executes it,
 *   3. email the team what happened (pushed automatically / push manually
 *      with the reason / already at the warehouse), plus a history line.
 *
 * Safe to call unconditionally: does nothing when no payment hold is set.
 */
export async function releasePaymentHoldIfSet(
  supabase: SupabaseClient,
  orderId: string,
  via: string,
): Promise<boolean> {
  // Atomic claim — only the caller that actually flips hold → null proceeds.
  const { data: released, error } = await supabase
    .from('orders')
    .update({ hold: null })
    .eq('id', orderId)
    .eq('hold', 'payment_hold')
    .select(
      'id, status, po_number, so_number, company_id, netsuite_so_id, external_fulfillment_id, fulfillment_status',
    );
  if (error) {
    console.error('[payment-hold] release failed:', error.message);
    return false;
  }
  if (!released || released.length === 0) return false;

  const order = released[0];

  // ---- Auto-push decision ----
  const atWarehouse =
    !!order.external_fulfillment_id && order.fulfillment_status !== 'cancelled';
  let outcome: HoldReleaseOutcome;
  let detail = '';

  if (atWarehouse) {
    outcome = 'already_at_warehouse';
  } else if (!order.netsuite_so_id) {
    outcome = 'push_manually';
    detail = 'the order has no NetSuite Sales Order yet';
  } else if (!['In Process', 'Ready'].includes(order.status)) {
    // Conservative gate for the automated path only — manual push stays
    // available regardless of status, same as before.
    outcome = 'push_manually';
    detail = `the order status is "${order.status}"`;
  } else {
    const push = await pushOrderToWarehouse(supabase, orderId, { trigger: 'payment_release' });
    if (push.ok && !push.dryRun) {
      outcome = 'auto_pushed';
      if (push.warning) detail = push.warning;
    } else if (push.ok && push.dryRun) {
      outcome = 'push_manually';
      detail = 'ShipHero dry-run mode is on — nothing was sent';
    } else {
      outcome = 'push_manually';
      detail = push.message;
    }
  }

  await supabase.from('order_history').insert([
    {
      action_type: 'order_updated',
      order_id: orderId,
      status_from: order.status,
      status_to: order.status,
      notes:
        `Payment received (${via}) — payment hold released.` +
        (outcome === 'auto_pushed'
          ? ' Order pushed to the warehouse automatically.'
          : outcome === 'already_at_warehouse'
            ? ' Order is already at the warehouse.'
            : ` Auto-push to the warehouse did not run (${detail}) — push manually.`),
      changed_by_name: 'System',
      changed_by_role: 'admin',
    },
  ]);

  // Internal heads-up so the team knows what happened (and what's left to do).
  try {
    let companyName = 'Unknown company';
    if (order.company_id) {
      const { data: company } = await supabase
        .from('companies')
        .select('company_name')
        .eq('id', order.company_id)
        .maybeSingle();
      if (company?.company_name) companyName = company.company_name;
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const template = paymentHoldReleasedTemplate({
      poNumber: order.po_number || `Order-${orderId.substring(0, 8)}`,
      soNumber: order.so_number,
      companyName,
      orderId,
      siteUrl,
      via,
      outcome,
      detail,
    });
    const sent = await sendMail({
      to: 'orders@qiqiglobal.com',
      subject: template.subject,
      html: template.html,
    });
    if (!sent.success) console.error('[payment-hold] release notification failed:', sent.error);
  } catch (e: any) {
    console.error('[payment-hold] release notification failed:', e?.message);
  }

  return true;
}
