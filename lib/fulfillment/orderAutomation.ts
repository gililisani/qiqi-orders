import type { SupabaseClient } from '@supabase/supabase-js';
import { createInvoiceForOrder } from '../orderInvoice';
import { prepareOrderEmail } from '../orderEmails';
import { sendMail } from '../emailService';
import { recalculateCompanyTargetPeriods } from '../targetPeriods';

/**
 * The fulfillment → order automation (owner spec, 2026-09-01):
 *
 *   warehouse packed  (fulfillment_status 'ready_for_pickup')
 *       → create the NetSuite invoice, move the order to Ready,
 *         email the client "ready for pickup"
 *   warehouse close-out (fulfillment_status 'shipped' — their post-pickup step)
 *       → move the order to Done (invoicing first if packed was missed)
 *
 * Runs from the polling cron (and is safe to run repeatedly): every step is
 * guarded by an atomic status-claim UPDATE or by the invoice detect-first
 * logic, so webhook + cron racing can't double-invoice or double-email.
 */

export interface AutomationOrderRow {
  id: string;
  status: string;
  company_id: string | null;
  fulfillment_status: string | null;
  netsuite_so_id: string | null;
  netsuite_invoice_id: string | null;
}

export interface AutomationDecision {
  /** Create the NS invoice (also moves the order to Ready). */
  invoice: boolean;
  /** Claim In Process → Ready without invoicing (invoice already exists). */
  markReady: boolean;
  /** Email the client that the order is ready for pickup. */
  sendReadyEmail: boolean;
  /** Claim Ready/In Process → Done (order was picked up / closed out). */
  markDone: boolean;
}

const NONE: AutomationDecision = { invoice: false, markReady: false, sendReadyEmail: false, markDone: false };

/** Pure decision — what the automation should do for this order state. */
export function decideAutomation(o: AutomationOrderRow): AutomationDecision {
  // Only orders inside the fulfillment window are automated. Done/Cancelled
  // never move backwards; Draft/Open were never accepted.
  if (!['In Process', 'Ready'].includes(o.status)) return NONE;
  // Without an SO there is nothing to invoice — manual repair territory.
  if (!o.netsuite_so_id) return NONE;

  if (o.fulfillment_status === 'shipped') {
    return {
      // Missed packed signal (rare): invoice on the way to Done, but the
      // "ready for pickup" email would be nonsense — the goods already left.
      invoice: o.status === 'In Process' && !o.netsuite_invoice_id,
      markReady: false,
      sendReadyEmail: false,
      markDone: true,
    };
  }

  if (o.fulfillment_status === 'ready_for_pickup' && o.status === 'In Process') {
    return {
      invoice: !o.netsuite_invoice_id,
      markReady: !!o.netsuite_invoice_id,
      sendReadyEmail: true,
      markDone: false,
    };
  }

  return NONE;
}

async function claimStatus(
  supabase: SupabaseClient,
  orderId: string,
  from: string[],
  to: string,
): Promise<string | null> {
  // Atomic claim: only ONE runner (webhook retry, overlapping cron) wins the
  // transition; everyone else sees zero rows and stays silent.
  const { data, error } = await supabase
    .from('orders')
    .update({ status: to })
    .eq('id', orderId)
    .in('status', from)
    .select('status');
  if (error) {
    console.error(`[fulfillment-automation] status claim ${from.join('/')}→${to} failed:`, error.message);
    return null;
  }
  return data && data.length > 0 ? to : null;
}

async function sendReadyEmail(supabase: SupabaseClient, orderId: string): Promise<boolean> {
  const prepared = await prepareOrderEmail(supabase, orderId, 'ready');
  if (!prepared.ok) {
    if ('skipped' in prepared && prepared.skipped) return false;
    console.error('[fulfillment-automation] ready email prepare failed:', 'error' in prepared ? prepared.error : '');
    return false;
  }
  const sent = await sendMail({
    to: prepared.recipientEmail,
    subject: prepared.subject,
    html: prepared.html,
  });
  if (!sent.success) {
    console.error('[fulfillment-automation] ready email send failed:', sent.error);
    return false;
  }
  return true;
}

/**
 * Apply the automation to one order. Returns the actions actually performed
 * (for cron logging). `allowInvoice` is false when NetSuite isn't configured
 * (staging) — status recording still works, invoicing waits.
 */
export async function runFulfillmentAutomation(
  supabase: SupabaseClient,
  order: AutomationOrderRow,
  opts: { allowInvoice: boolean },
): Promise<string[]> {
  const actions: string[] = [];
  const d = decideAutomation(order);
  if (!d.invoice && !d.markReady && !d.markDone) return actions;

  let becameReady = false;

  if (d.invoice) {
    if (!opts.allowInvoice) {
      console.log(`[fulfillment-automation] order ${order.id}: invoice needed but NetSuite not configured — skipping.`);
      return actions;
    }
    const outcome = await createInvoiceForOrder(supabase, order.id);
    if (outcome.ok) {
      // createInvoiceForOrder moved the order In Process → Ready.
      actions.push(outcome.linked ? 'invoice_linked' : 'invoice_created');
      becameReady = order.status === 'In Process';
    } else if (outcome.code === 'already_invoiced') {
      // Raced with another runner (or an admin) — fall through to the claim.
      becameReady = (await claimStatus(supabase, order.id, ['In Process'], 'Ready')) !== null;
      if (becameReady) actions.push('marked_ready');
    } else {
      console.error(`[fulfillment-automation] order ${order.id}: invoice failed (${outcome.code}): ${outcome.message}`);
      return actions;
    }
  } else if (d.markReady) {
    becameReady = (await claimStatus(supabase, order.id, ['In Process'], 'Ready')) !== null;
    if (becameReady) actions.push('marked_ready');
  }

  if (becameReady) {
    await supabase.from('order_history').insert([
      {
        action_type: 'status_change',
        order_id: order.id,
        status_from: 'In Process',
        status_to: 'Ready',
        notes: 'Order is ready for pickup',
        changed_by_name: 'System',
        changed_by_role: 'admin',
        visible_to_client: true,
      },
    ]);
    if (d.sendReadyEmail) {
      const sent = await sendReadyEmail(supabase, order.id);
      if (sent) actions.push('ready_email_sent');
    }
  }

  if (d.markDone) {
    const done = await claimStatus(supabase, order.id, ['In Process', 'Ready'], 'Done');
    if (done) {
      actions.push('marked_done');
      await supabase.from('order_history').insert([
        {
          action_type: 'status_change',
          order_id: order.id,
          status_from: order.status,
          status_to: 'Done',
          notes: 'Order picked up — completed (warehouse close-out)',
          changed_by_name: 'System',
          changed_by_role: 'admin',
          visible_to_client: true,
        },
      ]);
      if (order.company_id) {
        try {
          await recalculateCompanyTargetPeriods(supabase, order.company_id);
          actions.push('target_periods_recalculated');
        } catch (e: any) {
          console.error('[fulfillment-automation] target period recalc failed:', e?.message);
        }
      }
    }
  }

  return actions;
}
