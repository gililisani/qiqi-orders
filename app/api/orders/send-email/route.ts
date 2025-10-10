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

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        `
        *,
        companies (company_name),
        clients (email, name),
        order_items (
          quantity,
          unit_price,
          Products (item_name)
        )
      `
      )
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Prepare email data
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    const emailData = {
      orderNumber: order.order_number,
      orderId: order.id,
      companyName: order.companies?.company_name || 'N/A',
      status: order.status,
      poNumber: order.po_number,
      soNumber: order.so_number,
      totalAmount: order.total_amount,
      items: order.order_items?.map((item: any) => ({
        productName: item.Products?.item_name || 'Unknown Product',
        quantity: item.quantity,
        unitPrice: item.unit_price,
      })),
      customMessage: customMessage || undefined,
      siteUrl,
    };

    // Get recipient email from clients table
    const recipientEmail = order.clients?.email;
    if (!recipientEmail) {
      return NextResponse.json(
        { error: 'Order user email not found' },
        { status: 400 }
      );
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
