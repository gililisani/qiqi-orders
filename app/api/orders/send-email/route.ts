/**
 * API Route: Send Order Email
 *
 * POST /api/orders/send-email
 *
 * Sends automated or custom email notifications for orders via Microsoft Graph API.
 * Auth: admin (any order) or client (only their company's orders).
 *
 * The recipient resolution + template building lives in lib/orderEmails.ts
 * (shared with the fulfillment automation); this route adds the user guard,
 * order-access check and rate limits.
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
import { prepareOrderEmail, ORDER_EMAIL_TYPES, type OrderEmailType } from '../../../../lib/orderEmails';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAnyRole(request, ['admin', 'client']);

    const body = await request.json();
    const { orderId, emailType, customMessage } = body;

    if (!orderId || !emailType) {
      return NextResponse.json(
        { error: 'Missing required fields: orderId and emailType' },
        { status: 400 }
      );
    }

    if (!(ORDER_EMAIL_TYPES as readonly string[]).includes(emailType)) {
      return NextResponse.json(
        { error: `Invalid emailType. Must be one of: ${ORDER_EMAIL_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    const access = await assertOrderAccess(supabase, user, orderId);
    if (!access.ok) return access.response;

    const prepared = await prepareOrderEmail(
      supabase,
      orderId,
      emailType as OrderEmailType,
      typeof customMessage === 'string' ? customMessage : undefined,
    );

    if (!prepared.ok) {
      if ('skipped' in prepared && prepared.skipped) {
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
      const message = 'error' in prepared ? prepared.error : 'Failed to prepare email';
      const status = message.startsWith('Order not found') ? 404 : 500;
      return NextResponse.json({ error: message }, { status });
    }

    const recipientKey = normalizeEmailForRateLimit(prepared.recipientEmail);
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

    const sendStartedAt = Date.now();
    const result = await sendMail({
      to: prepared.recipientEmail,
      subject: prepared.subject,
      html: prepared.html,
    });
    const durationMs = Date.now() - sendStartedAt;

    if (!result.success) {
      console.error('[send-email] FAILED', {
        orderId,
        emailType,
        recipient: prepared.recipientEmail,
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
      recipient: prepared.recipientEmail,
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
