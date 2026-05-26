/**
 * API Route: Send Order Email
 *
 * POST /api/orders/send-email
 *
 * Sends automated or custom email notifications for orders via Microsoft Graph API.
 * Auth: admin (any order) or client (only their company's orders).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAnyRole } from '../../../../platform/auth/guards';
import { assertOrderAccess } from '../../../../platform/auth/orderAccess';
import {
  SEND_ORDER_EMAIL_RATE,
  SEND_ORDER_EMAIL_ACTOR_GLOBAL_RATE,
  enforceRateLimit,
  normalizeEmailForRateLimit,
} from '../../../../platform/rateLimit';
import { sendMail } from '../../../../lib/emailService';
import {
  orderCreatedTemplate,
  orderInProcessTemplate,
  orderReadyTemplate,
  orderCancelledTemplate,
  customUpdateTemplate,
  orderUpdatedTemplate,
} from '../../../../lib/emailTemplates';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAnyRole(request, ['admin', 'client']);

    const body = await request.json();
    const { orderId, emailType, customMessage } = body;

    // Validate input
    if (!orderId || !emailType) {
      return NextResponse.json(
        { error: 'Missing required fields: orderId and emailType' },
        { status: 400 }
      );
    }

    // Valid email types
    const validEmailTypes = ['created', 'in_process', 'ready', 'cancelled', 'custom', 'updated'];
    if (!validEmailTypes.includes(emailType)) {
      return NextResponse.json(
        { error: `Invalid emailType. Must be one of: ${validEmailTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const access = await assertOrderAccess(supabase, user, orderId);
    if (!access.ok) return access.response;

    console.log('[send-email] Fetching order:', orderId);

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('[send-email] Order fetch failed:', orderError);
      return NextResponse.json(
        { error: 'Order not found', details: orderError?.message },
        { status: 404 }
      );
    }

    // Fetch company separately
    const { data: company } = await supabase
      .from('companies')
      .select('company_name, company_email, ship_to_contact_email')
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
        product:Products (item_name)
      `)
      .eq('order_id', orderId);

    console.log('[send-email] Fetched data:', {
      order: !!order,
      company: !!company,
      client: !!client,
      itemsCount: orderItems?.length,
    });

    // Prepare email data
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

    // Get recipient email - try client first, then company contact emails
    let recipientEmail = client?.email;

    if (!recipientEmail) {
      // No client user - try company contact emails
      recipientEmail = company?.ship_to_contact_email || company?.company_email;

      if (!recipientEmail) {
        console.log('[send-email] No recipient email found for order:', orderId, '- skipping email (not an error)');
        return NextResponse.json(
          {
            success: true,
            skipped: true,
            message: 'No recipient email configured - email not sent',
          },
          { status: 200 }
        );
      }

      console.log('[send-email] No client user, using company email:', recipientEmail);
    }

    const recipientKey = normalizeEmailForRateLimit(recipientEmail);
    const sendRate = await enforceRateLimit(supabase, {
      key: `send-email:actor:${user.id}:order:${orderId}:recipient:${recipientKey}`,
      limit: SEND_ORDER_EMAIL_RATE.limit,
      windowSeconds: SEND_ORDER_EMAIL_RATE.windowSeconds,
    });
    if (!sendRate.ok) return sendRate.response;

    const globalRate = await enforceRateLimit(supabase, {
      key: `send-email:actor:${user.id}:global`,
      limit: SEND_ORDER_EMAIL_ACTOR_GLOBAL_RATE.limit,
      windowSeconds: SEND_ORDER_EMAIL_ACTOR_GLOBAL_RATE.windowSeconds,
    });
    if (!globalRate.ok) return globalRate.response;

    // Select appropriate email template
    let emailTemplate: { subject: string; html: string };

    switch (emailType) {
      case 'created':
        emailTemplate = orderCreatedTemplate(emailData);
        break;
      case 'in_process':
        emailTemplate = orderInProcessTemplate(emailData);
        break;
      case 'ready':
        emailTemplate = orderReadyTemplate(emailData);
        break;
      case 'cancelled':
        emailTemplate = orderCancelledTemplate(emailData);
        break;
      case 'custom':
        emailTemplate = customUpdateTemplate(emailData);
        break;
      case 'updated':
        emailTemplate = orderUpdatedTemplate(emailData);
        break;
      default:
        return NextResponse.json({ error: 'Invalid email type' }, { status: 400 });
    }

    // Send email
    const sendStartedAt = Date.now();
    const result = await sendMail({
      to: recipientEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });
    const durationMs = Date.now() - sendStartedAt;

    if (!result.success) {
      console.error('[send-email] FAILED', {
        orderId,
        emailType,
        recipient: recipientEmail,
        actor: user.id,
        actorRoles: user.roles,
        durationMs,
        error: result.error,
      });
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    console.log('[send-email] OK', {
      orderId,
      emailType,
      recipient: recipientEmail,
      actor: user.id,
      actorRoles: user.roles,
      durationMs,
      messageId: result.messageId,
    });

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully',
      messageId: result.messageId,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error sending email:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}
