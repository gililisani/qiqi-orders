/**
 * API Route: Send Order Notification to Internal Team
 * 
 * POST /api/orders/send-notification
 * 
 * Sends email notification to orders@qiqiglobal.com when new orders are created
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendMail } from '../../../../lib/emailService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json(
        { error: 'Missing required field: orderId' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        companies (company_name, netsuite_number),
        clients!user_id (email, name),
        order_items (
          quantity,
          total_price,
          Products (item_name, sku)
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Build email content
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const poNumber = order.po_number || `Order-${order.id.substring(0, 8)}`;
    const companyName = order.companies?.company_name || 'N/A';
    const clientName = order.clients?.name || 'Admin Created';
    const clientEmail = order.clients?.email || 'N/A';
    const totalValue = order.total_value || 0;
    const itemCount = order.order_items?.length || 0;

    const itemsList = order.order_items?.map((item: any) => 
      `<tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.Products?.item_name || 'Unknown'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.Products?.sku || 'N/A'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${item.total_price.toFixed(2)}</td>
      </tr>`
    ).join('') || '';

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #ffffff; padding: 30px; text-align: center; border-bottom: 3px solid #000000;">
              <img src="https://partners.qiqiglobal.com/logo.png" alt="Qiqi" style="height: 40px; width: auto;" />
            </td>
          </tr>
          
          <tr>
            <td style="padding: 30px;">
              <h1 style="margin: 0 0 10px; font-size: 24px; font-weight: 700; color: #111827;">
                🔔 New Order Created
              </h1>
              
              <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <table width="100%" cellpadding="8" cellspacing="0">
                  <tr>
                    <td style="font-weight: 600; color: #6b7280; font-size: 14px;">PO Number:</td>
                    <td style="color: #111827; font-size: 14px; font-weight: 600;">${poNumber}</td>
                  </tr>
                  <tr>
                    <td style="font-weight: 600; color: #6b7280; font-size: 14px;">Company:</td>
                    <td style="color: #111827; font-size: 14px;">${companyName}</td>
                  </tr>
                  <tr>
                    <td style="font-weight: 600; color: #6b7280; font-size: 14px;">Created By:</td>
                    <td style="color: #111827; font-size: 14px;">${clientName} (${clientEmail})</td>
                  </tr>
                  <tr>
                    <td style="font-weight: 600; color: #6b7280; font-size: 14px;">Total Value:</td>
                    <td style="color: #111827; font-size: 14px; font-weight: 600;">$${totalValue.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="font-weight: 600; color: #6b7280; font-size: 14px;">Items:</td>
                    <td style="color: #111827; font-size: 14px;">${itemCount} item(s)</td>
                  </tr>
                </table>
              </div>

              <h3 style="margin: 20px 0 10px; font-size: 16px; font-weight: 600; color: #111827;">Order Items:</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #f9fafb;">
                    <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Product</th>
                    <th style="padding: 10px; text-align: center; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 2px solid #e5e7eb;">SKU</th>
                    <th style="padding: 10px; text-align: center; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Qty</th>
                    <th style="padding: 10px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsList}
                </tbody>
              </table>

              <div style="margin: 30px 0; text-align: center;">
                <a href="${siteUrl}/admin/orders/${order.id}" 
                   style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
                  View Order in Admin Panel
                </a>
              </div>

              <p style="margin: 20px 0 0; color: #6b7280; font-size: 14px;">
                This is an automated notification from the Qiqi Partners Hub.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Send email to orders@qiqiglobal.com
    const result = await sendMail({
      to: 'orders@qiqiglobal.com',
      subject: `🔔 New Order: ${poNumber} - ${companyName}`,
      html: emailHtml,
    });

    if (!result.success) {
      console.error('[send-notification] Failed:', result.error);
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Notification sent successfully',
    });

  } catch (error: any) {
    console.error('[send-notification] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send notification' },
      { status: 500 }
    );
  }
}

