/**
 * API Route: Send Order Email
 * 
 * Server-side endpoint for sending order notification emails
 * Includes rate limiting and authentication checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '../../../../../lib/supabase-server';
import { sendMail } from '../../../../../lib/emailService';
import {
  orderCreatedEmail,
  orderInProcessEmail,
  orderReadyEmail,
  orderCancelledEmail,
  customUpdateEmail,
} from '../../../../../lib/emailTemplates';

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10; // 10 emails per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    // Create new limit window
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX) {
    return false; // Rate limit exceeded
  }

  // Increment count
  userLimit.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabase();

    // Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check rate limit
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 10 emails per minute.' },
        { status: 429 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { orderId, emailType, customMessage } = body;

    if (!orderId || !emailType) {
      return NextResponse.json(
        { error: 'Missing required fields: orderId, emailType' },
        { status: 400 }
      );
    }

    // Validate email type
    const validTypes = ['created', 'in_process', 'ready', 'cancelled', 'custom'];
    if (!validTypes.includes(emailType)) {
      return NextResponse.json(
        { error: `Invalid emailType. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Fetch order with related data
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        `
        *,
        user:clients(id, name, email),
        company:companies(id, company_name, netsuite_number),
        location:Locations(location_name, address_1, address_2, city, state, zip)
      `
      )
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check authorization (user must own the order OR be an admin)
    const { data: profile } = await supabase
      .from('clients')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';
    const isOwner = order.user_id === user.id;

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: 'Not authorized to send emails for this order' },
        { status: 403 }
      );
    }

    // Ensure customer email exists
    if (!order.user || !order.user[0]?.email) {
      return NextResponse.json(
        { error: 'Customer email not found for this order' },
        { status: 400 }
      );
    }

    const customerEmail = order.user[0].email;
    const customerName = order.user[0].name || 'Customer';
    const companyName = order.company?.[0]?.company_name || 'N/A';

    // Format pickup address if location exists
    let pickupAddress = '';
    if (order.location && order.location[0]) {
      const loc = order.location[0];
      pickupAddress = [
        loc.location_name,
        loc.address_1,
        loc.address_2,
        `${loc.city}, ${loc.state} ${loc.zip}`,
      ]
        .filter(Boolean)
        .join('\n');
    }

    // Build order URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const orderUrl = `${baseUrl}/client/orders/${order.id}`;

    // Prepare email data
    const emailData = {
      orderId: order.id,
      poNumber: order.po_number,
      customerName,
      companyName,
      orderDate: new Date(order.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      totalValue: order.total_value || 0,
      status: order.status,
      orderUrl,
      netsuiteOrderId: order.netsuite_sales_order_id,
      pickupAddress,
      customMessage,
    };

    // Select template based on email type
    let emailTemplate;
    switch (emailType) {
      case 'created':
        emailTemplate = orderCreatedEmail(emailData);
        break;
      case 'in_process':
        emailTemplate = orderInProcessEmail(emailData);
        break;
      case 'ready':
        emailTemplate = orderReadyEmail(emailData);
        break;
      case 'cancelled':
        emailTemplate = orderCancelledEmail(emailData);
        break;
      case 'custom':
        emailTemplate = customUpdateEmail(emailData);
        break;
      default:
        return NextResponse.json({ error: 'Invalid email type' }, { status: 400 });
    }

    // Send email
    const result = await sendMail({
      to: customerEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      sentTo: customerEmail,
    });
  } catch (error: any) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}

