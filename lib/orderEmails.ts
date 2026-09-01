import type { SupabaseClient } from '@supabase/supabase-js';
import {
  orderCreatedTemplate,
  orderInProcessTemplate,
  orderReadyTemplate,
  orderCancelledTemplate,
  customUpdateTemplate,
  orderUpdatedTemplate,
} from './emailTemplates';

/**
 * Order email preparation — extracted from /api/orders/send-email so the
 * fulfillment automation (cron/webhook context, no user session) can send the
 * same emails. This module resolves the recipient and builds the message;
 * callers do the actual sendMail (the route adds its rate limits first).
 */

export const ORDER_EMAIL_TYPES = [
  'created',
  'in_process',
  'ready',
  'cancelled',
  'custom',
  'updated',
] as const;
export type OrderEmailType = (typeof ORDER_EMAIL_TYPES)[number];

export type PreparedOrderEmail =
  | { ok: true; recipientEmail: string; subject: string; html: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string };

export async function prepareOrderEmail(
  supabase: SupabaseClient,
  orderId: string,
  emailType: OrderEmailType,
  customMessage?: string,
): Promise<PreparedOrderEmail> {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return { ok: false, error: `Order not found${orderError ? `: ${orderError.message}` : ''}` };
  }

  const { data: company } = await supabase
    .from('companies')
    .select('company_name, company_email, ship_to_contact_email')
    .eq('id', order.company_id)
    .single();

  let client: { email: string | null; name: string | null } | null = null;
  if (order.user_id) {
    const { data: clientData } = await supabase
      .from('clients')
      .select('email, name')
      .eq('id', order.user_id)
      .single();
    client = clientData;
  }

  const { data: orderItems } = await supabase
    .from('order_items')
    .select(
      `
      quantity,
      total_price,
      product:Products (item_name)
    `,
    )
    .eq('order_id', orderId);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const emailData = {
    poNumber: order.po_number || `Order-${order.id.substring(0, 8)}`,
    orderId: order.id,
    companyName: company?.company_name || 'N/A',
    status: order.status,
    soNumber: order.so_number,
    totalAmount: order.total_value,
    items: orderItems?.map((item: any) => ({
      productName: item.product?.item_name || 'Unknown Product',
      quantity: item.quantity,
      totalPrice: item.total_price,
    })),
    customMessage: customMessage || undefined,
    siteUrl,
  };

  // Recipient: the ordering client user first, then the company contacts.
  const recipientEmail =
    client?.email || company?.ship_to_contact_email || company?.company_email || null;
  if (!recipientEmail) {
    return { ok: false, skipped: true, reason: 'No recipient email configured' };
  }

  let template: { subject: string; html: string };
  switch (emailType) {
    case 'created':
      template = orderCreatedTemplate(emailData);
      break;
    case 'in_process':
      template = orderInProcessTemplate(emailData);
      break;
    case 'ready':
      template = orderReadyTemplate(emailData);
      break;
    case 'cancelled':
      template = orderCancelledTemplate(emailData);
      break;
    case 'custom':
      template = customUpdateTemplate(emailData);
      break;
    case 'updated':
      template = orderUpdatedTemplate(emailData);
      break;
  }

  return { ok: true, recipientEmail, subject: template.subject, html: template.html };
}
