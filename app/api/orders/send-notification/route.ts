/**
 * API Route: Send Order Notification to Internal Team
 *
 * POST /api/orders/send-notification
 *
 * Sends email notification to orders@qiqiglobal.com when new orders are created
 * Auth: admin (any order) or client (only their company's orders).
 */

import { NextRequest, NextResponse } from 'next/server';
import { escapeHtml, sanitizeEmailHeader } from '../../../../lib/htmlEscape';
import { createServiceRoleClient, requireAnyRole } from '../../../../platform/auth/guards';
import { assertOrderAccess } from '../../../../platform/auth/orderAccess';
import { sendMail } from '../../../../lib/emailService';
import {
  emailWrapper,
  emailHeading,
  emailFactCard,
  emailItemsTable,
  emailButton,
} from '../../../../lib/emailTemplates';
import {
  SEND_ORDER_NOTIFICATION_RATE,
  SEND_ORDER_NOTIFICATION_ACTOR_GLOBAL_RATE,
  enforceRateLimit,
} from '../../../../platform/rateLimit';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAnyRole(request, ['admin', 'client']);

    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Missing required field: orderId' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const access = await assertOrderAccess(supabase, user, orderId);
    if (!access.ok) return access.response;

    const limited = await enforceRateLimit(supabase, {
      key: `send-notification:actor:${user.id}:order:${orderId}`,
      limit: SEND_ORDER_NOTIFICATION_RATE.limit,
      windowSeconds: SEND_ORDER_NOTIFICATION_RATE.windowSeconds,
    });
    if (!limited.ok) return limited.response;

    const globalLimit = await enforceRateLimit(supabase, {
      key: `send-notification:actor:${user.id}:global`,
      limit: SEND_ORDER_NOTIFICATION_ACTOR_GLOBAL_RATE.limit,
      windowSeconds: SEND_ORDER_NOTIFICATION_ACTOR_GLOBAL_RATE.windowSeconds,
    });
    if (!globalLimit.ok) return globalLimit.response;

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('[send-notification] Order fetch failed:', orderError);
      return NextResponse.json(
        { error: 'Order not found', details: orderError?.message },
        { status: 404 }
      );
    }

    // Fetch company separately
    const { data: company } = await supabase
      .from('companies')
      .select('company_name, netsuite_number')
      .eq('id', order.company_id)
      .single();

    // Fetch client (if user_id exists)
    let client = null;
    if (order.user_id) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('email, name')
        .eq('id', order.user_id)
        .single();
      client = clientData;
    }

    // Fetch order items
    const { data: orderItems } = await supabase
      .from('order_items')
      .select(`
        quantity,
        total_price,
        product:Products (item_name, sku)
      `)
      .eq('order_id', orderId);

    // Build email content
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const poNumber = order.po_number || `Order-${order.id.substring(0, 8)}`;
    const companyName = company?.company_name || 'N/A';
    const clientName = client?.name || 'Admin Created';
    const clientEmail = client?.email || 'N/A';
    const totalValue = order.total_value || 0;
    const itemCount = orderItems?.length || 0;

    const itemRows =
      orderItems?.map((item: any) => ({
        productName: `${item.product?.item_name || 'Unknown'} — ${item.product?.sku || 'N/A'}`,
        quantity: item.quantity,
        totalPrice: item.total_price,
      })) ?? [];

    const emailHtml = emailWrapper(
      `
      ${emailHeading('New order', `New order from ${escapeHtml(companyName)}`)}
      ${emailFactCard([
        { label: 'PO number', value: escapeHtml(poNumber) },
        { label: 'Created by', value: escapeHtml(`${clientName} (${clientEmail})`) },
        { label: 'Items', value: escapeHtml(`${itemCount} line${itemCount === 1 ? '' : 's'}`) },
      ])}
      ${emailItemsTable(itemRows, totalValue)}
      ${emailButton('Open in the admin panel', `${siteUrl}/admin/orders/${order.id}`)}
      `,
      { footerNote: 'Automated internal notification from the Qiqi Partners Hub.' },
    );

    // Send email to orders@qiqiglobal.com.
    // Headers are plain text — use sanitizeEmailHeader (CR/LF strip), NOT
    // escapeHtml (which would put HTML entities into the visible subject).
    const subject = sanitizeEmailHeader(
      `New order: ${poNumber} — ${companyName}`,
    );
    const sendStartedAt = Date.now();
    const result = await sendMail({
      to: 'orders@qiqiglobal.com',
      subject,
      html: emailHtml,
    });
    const durationMs = Date.now() - sendStartedAt;

    if (!result.success) {
      console.error('[send-notification] FAILED', {
        orderId,
        recipient: 'orders@qiqiglobal.com',
        actor: user.id,
        actorRoles: user.roles,
        durationMs,
        error: result.error,
      });
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    console.log('[send-notification] OK', {
      orderId,
      recipient: 'orders@qiqiglobal.com',
      actor: user.id,
      actorRoles: user.roles,
      durationMs,
      messageId: result.messageId,
    });

    return NextResponse.json({
      success: true,
      message: 'Notification sent successfully',
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('[send-notification] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send notification' },
      { status: 500 }
    );
  }
}
