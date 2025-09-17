import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface NotificationData {
  orderId: string;
  type: 'status_change' | 'order_created' | 'netsuite_sync' | 'completion';
  recipientEmail?: string;
  customMessage?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { orderId, type, recipientEmail, customMessage }: NotificationData = await request.json();

    if (!orderId || !type) {
      return NextResponse.json(
        { error: 'Order ID and notification type are required' },
        { status: 400 }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get order details with client and company information
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        client:clients(name, email),
        company:companies(
          company_name,
          netsuite_number
        ),
        order_items:order_items(
          *,
          product:Products(item_name, sku)
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

    // Determine recipient email
    const toEmail = recipientEmail || order.client?.email;
    if (!toEmail) {
      return NextResponse.json(
        { error: 'No recipient email found' },
        { status: 400 }
      );
    }

    // Generate notification content based on type
    let subject: string;
    let htmlContent: string;

    switch (type) {
      case 'order_created':
        subject = `Order Confirmation - ${order.id.substring(0, 8)}`;
        htmlContent = generateOrderConfirmationEmail(order);
        break;
      
      case 'status_change':
        subject = `Order Status Update - ${order.id.substring(0, 8)}`;
        htmlContent = generateStatusChangeEmail(order, customMessage);
        break;
      
      case 'netsuite_sync':
        subject = `Order Processing Update - ${order.id.substring(0, 8)}`;
        htmlContent = generateNetSuiteSyncEmail(order);
        break;
      
      case 'completion':
        subject = `Order Completed - ${order.id.substring(0, 8)}`;
        htmlContent = generateCompletionEmail(order);
        break;
      
      default:
        return NextResponse.json(
          { error: 'Invalid notification type' },
          { status: 400 }
        );
    }

    // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
    // For now, we'll log the notification and store it in the database
    
    // Store notification in order history
    const { error: historyError } = await supabase
      .from('order_history')
      .insert([{
        order_id: orderId,
        status_from: null,
        status_to: order.status,
        notes: `${type} notification sent to ${toEmail}${customMessage ? ': ' + customMessage : ''}`,
        changed_by_name: 'System',
        changed_by_role: 'system'
      }]);

    if (historyError) {
      console.error('Error storing notification history:', historyError);
    }

    // Log for development (replace with actual email service)
    console.log('EMAIL NOTIFICATION:', {
      to: toEmail,
      subject,
      type,
      orderId,
      htmlContent: htmlContent.substring(0, 200) + '...'
    });

    return NextResponse.json({
      success: true,
      message: 'Notification sent successfully',
      recipient: toEmail,
      type,
      orderId
    });

  } catch (error: any) {
    console.error('Notification error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send notification' },
      { status: 500 }
    );
  }
}

function generateOrderConfirmationEmail(order: any): string {
  const itemsList = order.order_items?.map((item: any) => 
    `<li>${item.product?.item_name || 'Unknown Product'} (${item.product?.sku || 'N/A'}) - Qty: ${item.quantity} - $${item.total_price?.toFixed(2) || '0.00'}</li>`
  ).join('') || '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
        <h1 style="color: #333; margin: 0;">Order Confirmation</h1>
      </div>
      
      <div style="padding: 20px; background-color: white;">
        <h2 style="color: #333;">Thank you for your order!</h2>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Order Details</h3>
          <p><strong>Order ID:</strong> ${order.id}</p>
          <p><strong>Company:</strong> ${order.company?.company_name || 'N/A'}</p>
          <p><strong>Status:</strong> ${order.status}</p>
          <p><strong>Total Value:</strong> $${order.total_value?.toFixed(2) || '0.00'}</p>
          <p><strong>Support Fund Used:</strong> $${order.support_fund_used?.toFixed(2) || '0.00'}</p>
          <p><strong>Order Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</p>
        </div>
        
        <h3 style="color: #333;">Items Ordered</h3>
        <ul style="list-style-type: none; padding: 0;">
          ${itemsList}
        </ul>
        
        <div style="margin-top: 30px; padding: 15px; background-color: #e3f2fd; border-radius: 5px;">
          <p style="margin: 0;"><strong>What's Next?</strong></p>
          <p style="margin: 10px 0 0 0;">Your order is being processed and will be sent to NetSuite for fulfillment. You'll receive updates as your order progresses.</p>
        </div>
      </div>
      
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666;">
        <p>Questions? Contact our support team.</p>
        <p>© ${new Date().getFullYear()} Qiqi Orders</p>
      </div>
    </div>
  `;
}

function generateStatusChangeEmail(order: any, customMessage?: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
        <h1 style="color: #333; margin: 0;">Order Status Update</h1>
      </div>
      
      <div style="padding: 20px; background-color: white;">
        <h2 style="color: #333;">Your order status has been updated</h2>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Order ID:</strong> ${order.id}</p>
          <p><strong>Company:</strong> ${order.company?.company_name || 'N/A'}</p>
          <p><strong>Current Status:</strong> <span style="color: #28a745; font-weight: bold;">${order.status}</span></p>
          <p><strong>Order Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</p>
        </div>
        
        ${customMessage ? `
          <div style="margin: 20px 0; padding: 15px; background-color: #fff3cd; border-radius: 5px; border-left: 4px solid #ffc107;">
            <p style="margin: 0;"><strong>Note:</strong> ${customMessage}</p>
          </div>
        ` : ''}
        
        <div style="margin-top: 30px; text-align: center;">
          <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://your-domain.com'}/client/orders/${order.id}" 
             style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View Order Details
          </a>
        </div>
      </div>
      
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666;">
        <p>© ${new Date().getFullYear()} Qiqi Orders</p>
      </div>
    </div>
  `;
}

function generateNetSuiteSyncEmail(order: any): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
        <h1 style="color: #333; margin: 0;">Order Processing Update</h1>
      </div>
      
      <div style="padding: 20px; background-color: white;">
        <h2 style="color: #333;">Your order is now being processed</h2>
        
        <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
          <p style="margin: 0;"><strong>Good news!</strong> Your order has been successfully sent to our fulfillment system and is now being processed.</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Order ID:</strong> ${order.id}</p>
          <p><strong>Company:</strong> ${order.company?.company_name || 'N/A'}</p>
          <p><strong>NetSuite Order ID:</strong> ${order.netsuite_sales_order_id || 'Processing...'}</p>
          <p><strong>Total Value:</strong> $${order.total_value?.toFixed(2) || '0.00'}</p>
        </div>
        
        <p>You'll receive another notification once your order has been fulfilled and shipped.</p>
      </div>
      
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666;">
        <p>© ${new Date().getFullYear()} Qiqi Orders</p>
      </div>
    </div>
  `;
}

function generateCompletionEmail(order: any): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
        <h1 style="color: #333; margin: 0;">Order Completed</h1>
      </div>
      
      <div style="padding: 20px; background-color: white;">
        <h2 style="color: #28a745;">🎉 Your order has been completed!</h2>
        
        <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
          <p style="margin: 0;">Your order has been successfully fulfilled and should be on its way to you.</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Order ID:</strong> ${order.id}</p>
          <p><strong>Company:</strong> ${order.company?.company_name || 'N/A'}</p>
          <p><strong>Completion Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Total Value:</strong> $${order.total_value?.toFixed(2) || '0.00'}</p>
        </div>
        
        <p>Thank you for your business! If you have any questions about your order, please don't hesitate to contact us.</p>
      </div>
      
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666;">
        <p>© ${new Date().getFullYear()} Qiqi Orders</p>
      </div>
    </div>
  `;
}

// GET endpoint to retrieve notification history for an order
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get notification history from order_history table
    const { data: history, error } = await supabase
      .from('order_history')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch notification history' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId,
      history: history || []
    });

  } catch (error: any) {
    console.error('Error fetching notification history:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch notification history' },
      { status: 500 }
    );
  }
}
