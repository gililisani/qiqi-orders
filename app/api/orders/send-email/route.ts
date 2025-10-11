/**
 * API Route: Send Order Email
 * 
 * POST /api/orders/send-email
 * 
 * Sends automated or custom email notifications for orders via Microsoft Graph API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendMail } from '../../../../lib/emailService';
import {
  orderCreatedTemplate,
  orderInProcessTemplate,
  orderReadyTemplate,
  orderCancelledTemplate,
  customUpdateTemplate,
} from '../../../../lib/emailTemplates';

// Initialize Supabase client with service role (for server-side operations)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
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
    const validEmailTypes = ['created', 'in_process', 'ready', 'cancelled', 'custom'];
    if (!validEmailTypes.includes(emailType)) {
      return NextResponse.json(
        { error: `Invalid emailType. Must be one of: ${validEmailTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Fetch order details from database
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[send-email] Fetching order:', orderId);

    // Fetch order with all relationships and company contact info
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        `
        *,
        companies (company_name, company_email, ship_to_contact_email),
        clients!user_id (email, name),
        order_items (
          quantity,
          total_price,
          Products (item_name)
        )
      `
      )
      .eq('id', orderId)
      .single();

    console.log('[send-email] Query result:', { order: !!order, error: orderError });

    if (orderError || !order) {
      console.error('[send-email] Order fetch failed:', orderError);
      return NextResponse.json(
        { error: 'Order not found', details: orderError?.message },
        { status: 404 }
      );
    }

    // Prepare email data
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    const emailData = {
      poNumber: order.po_number || `Order-${order.id.substring(0, 8)}`,
      orderId: order.id,
      companyName: order.companies?.company_name || 'N/A',
      status: order.status,
      soNumber: order.so_number,
      totalAmount: order.total_amount,
      items: order.order_items?.map((item: any) => ({
        productName: item.Products?.item_name || 'Unknown Product',
        quantity: item.quantity,
        totalPrice: item.total_price,
      })),
      customMessage: customMessage || undefined,
      siteUrl,
    };

    // Get recipient email - try client first, then company contact emails
    let recipientEmail = order.clients?.email;
    
    if (!recipientEmail) {
      // No client user - try company contact emails
      recipientEmail = order.companies?.ship_to_contact_email || order.companies?.company_email;
      
      if (!recipientEmail) {
        console.error('[send-email] No recipient email found for order:', orderId);
        return NextResponse.json(
          { error: 'No recipient email found. Order has no user and company has no contact email configured.' },
          { status: 400 }
        );
      }
      
      console.log('[send-email] No client user, using company email:', recipientEmail);
    }

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
      default:
        return NextResponse.json(
          { error: 'Invalid email type' },
          { status: 400 }
        );
    }

    // Send email
    const result = await sendMail({
      to: recipientEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully',
      messageId: result.messageId,
    });
  } catch (error: any) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}
