import type { SupabaseClient } from '@supabase/supabase-js';
import { sendMail } from './emailService';
import { paymentHoldReleasedTemplate } from './emailTemplates';

/**
 * Payment-hold auto-release (status/badge redesign 2026-09-06).
 *
 * Called from the two places a payment can land without an admin looking at
 * the order: the Stripe invoice.paid webhook and the nightly NetSuite invoice
 * sync. If the order carries a payment hold, clear it atomically, write a
 * history line, and email the team so the unlocked order doesn't sit
 * forgotten — the warehouse push stays a HUMAN click.
 *
 * Safe to call unconditionally: does nothing when no payment hold is set,
 * and the conditional UPDATE means concurrent callers release (and email)
 * at most once.
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
    .select('id, status, po_number, so_number, company_id');
  if (error) {
    console.error('[payment-hold] release failed:', error.message);
    return false;
  }
  if (!released || released.length === 0) return false;

  const order = released[0];

  await supabase.from('order_history').insert([
    {
      action_type: 'order_updated',
      order_id: orderId,
      status_from: order.status,
      status_to: order.status,
      notes: `Payment received (${via}) — payment hold released. The order can now be pushed to the warehouse.`,
      changed_by_name: 'System',
      changed_by_role: 'admin',
    },
  ]);

  // Internal heads-up so the unlocked order gets its Push to Warehouse click.
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
