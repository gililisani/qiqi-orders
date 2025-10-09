/**
 * Email Templates for Order Notifications
 * 
 * Professional HTML email templates for various order statuses
 */

interface OrderEmailData {
  orderId: string;
  poNumber?: string;
  customerName: string;
  companyName: string;
  orderDate: string;
  totalValue: number;
  status: string;
  orderUrl: string;
  netsuiteOrderId?: string;
  pickupAddress?: string;
  customMessage?: string;
}

/**
 * Base HTML template wrapper
 */
function emailWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QIQI Orders</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 30px 40px; border-bottom: 1px solid #e5e5e5;">
              <img src="https://qiqiglobal.com/wp-content/uploads/2025/01/QIQI-Logo.svg" alt="QIQI" style="height: 40px; display: block;">
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; border-top: 1px solid #e5e5e5; background-color: #f9fafb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5;">
                © ${new Date().getFullYear()} QIQI Partners. All rights reserved.<br>
                This is an automated message from the QIQI Orders system.
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
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Order Created Email Template
 */
export function orderCreatedEmail(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px; font-weight: 600;">
      Thank You for Your Order! 🎉
    </h2>
    
    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
      Hi ${data.customerName},
    </p>
    
    <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.5;">
      We've received your order and will begin processing it shortly. Here are your order details:
    </p>
    
    <!-- Order Details Box -->
    <table style="width: 100%; border: 1px solid #e5e5e5; border-radius: 8px; margin-bottom: 30px;">
      <tr>
        <td style="padding: 20px; background-color: #f9fafb;">
          <table style="width: 100%;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 40%;">Order ID:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">#${data.poNumber || data.orderId.substring(0, 8)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Company:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${data.companyName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Order Date:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${data.orderDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Status:</td>
              <td style="padding: 8px 0;">
                <span style="display: inline-block; padding: 4px 12px; background-color: rgba(156, 163, 175, 0.2); color: #374151; border-radius: 6px; font-size: 12px; font-weight: 500; border: 1px solid #d1d5db;">
                  Open
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Total:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 16px; font-weight: 700;">${formatCurrency(data.totalValue)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
    <!-- CTA Button -->
    <table style="margin-bottom: 30px;">
      <tr>
        <td>
          <a href="${data.orderUrl}" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
            View Order Details
          </a>
        </td>
      </tr>
    </table>
    
    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
      We'll send you another email when your order status changes.
    </p>
  `;

  return {
    subject: `Order Confirmation - #${data.poNumber || data.orderId.substring(0, 8)}`,
    html: emailWrapper(content),
  };
}

/**
 * Order In Process Email Template
 */
export function orderInProcessEmail(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px; font-weight: 600;">
      Your Order Is Being Processed 🔄
    </h2>
    
    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
      Hi ${data.customerName},
    </p>
    
    <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.5;">
      Great news! We're now processing your order. ${data.netsuiteOrderId ? 'Here are the details:' : ''}
    </p>
    
    <!-- Order Details Box -->
    <table style="width: 100%; border: 1px solid #e5e5e5; border-radius: 8px; margin-bottom: 30px;">
      <tr>
        <td style="padding: 20px; background-color: #f9fafb;">
          <table style="width: 100%;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 40%;">Order ID:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">#${data.poNumber || data.orderId.substring(0, 8)}</td>
            </tr>
            ${data.netsuiteOrderId ? `
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Sales Order #:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${data.netsuiteOrderId}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Status:</td>
              <td style="padding: 8px 0;">
                <span style="display: inline-block; padding: 4px 12px; background-color: rgba(96, 165, 250, 0.2); color: #1e40af; border-radius: 6px; font-size: 12px; font-weight: 500; border: 1px solid #93c5fd;">
                  In Process
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Total:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 16px; font-weight: 700;">${formatCurrency(data.totalValue)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
    <!-- CTA Button -->
    <table style="margin-bottom: 30px;">
      <tr>
        <td>
          <a href="${data.orderUrl}" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
            View Order Details
          </a>
        </td>
      </tr>
    </table>
    
    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
      We'll notify you as soon as your order is ready for pickup.
    </p>
  `;

  return {
    subject: `Order Update: Now Processing - #${data.poNumber || data.orderId.substring(0, 8)}`,
    html: emailWrapper(content),
  };
}

/**
 * Order Ready Email Template
 */
export function orderReadyEmail(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px; font-weight: 600;">
      Your Order Is Ready for Pickup! ✅
    </h2>
    
    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
      Hi ${data.customerName},
    </p>
    
    <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.5;">
      Excellent news! Your order is ready and waiting for you.
    </p>
    
    <!-- Order Details Box -->
    <table style="width: 100%; border: 1px solid #e5e5e5; border-radius: 8px; margin-bottom: 20px;">
      <tr>
        <td style="padding: 20px; background-color: #f9fafb;">
          <table style="width: 100%;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 40%;">Order ID:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">#${data.poNumber || data.orderId.substring(0, 8)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Status:</td>
              <td style="padding: 8px 0;">
                <span style="display: inline-block; padding: 4px 12px; background-color: rgba(251, 146, 60, 0.2); color: #c2410c; border-radius: 6px; font-size: 12px; font-weight: 500; border: 1px solid #fdba74;">
                  Ready
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Total:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 16px; font-weight: 700;">${formatCurrency(data.totalValue)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
    ${data.pickupAddress ? `
    <!-- Pickup Address Box -->
    <table style="width: 100%; border: 1px solid #fbbf24; border-radius: 8px; margin-bottom: 30px; background-color: #fef3c7;">
      <tr>
        <td style="padding: 20px;">
          <h3 style="margin: 0 0 10px 0; color: #92400e; font-size: 16px; font-weight: 600;">
            📍 Pickup Location
          </h3>
          <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.5; white-space: pre-line;">
${data.pickupAddress}
          </p>
        </td>
      </tr>
    </table>
    ` : ''}
    
    <!-- CTA Button -->
    <table style="margin-bottom: 30px;">
      <tr>
        <td>
          <a href="${data.orderUrl}" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
            View Order Details
          </a>
        </td>
      </tr>
    </table>
    
    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
      Please bring this email or your order ID when picking up.
    </p>
  `;

  return {
    subject: `Order Ready for Pickup - #${data.poNumber || data.orderId.substring(0, 8)}`,
    html: emailWrapper(content),
  };
}

/**
 * Order Cancelled Email Template
 */
export function orderCancelledEmail(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px; font-weight: 600;">
      Order Cancelled
    </h2>
    
    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
      Hi ${data.customerName},
    </p>
    
    <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.5;">
      Your order has been cancelled. Here are the details:
    </p>
    
    <!-- Order Details Box -->
    <table style="width: 100%; border: 1px solid #e5e5e5; border-radius: 8px; margin-bottom: 30px;">
      <tr>
        <td style="padding: 20px; background-color: #f9fafb;">
          <table style="width: 100%;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 40%;">Order ID:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">#${data.poNumber || data.orderId.substring(0, 8)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Company:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${data.companyName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Status:</td>
              <td style="padding: 8px 0;">
                <span style="display: inline-block; padding: 4px 12px; background-color: rgba(244, 114, 182, 0.15); color: #be185d; border-radius: 6px; font-size: 12px; font-weight: 500; border: 1px solid #f9a8d4;">
                  Cancelled
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
    <!-- CTA Button -->
    <table style="margin-bottom: 30px;">
      <tr>
        <td>
          <a href="${data.orderUrl}" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
            View Order Details
          </a>
        </td>
      </tr>
    </table>
    
    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
      If you have any questions, please contact our support team.
    </p>
  `;

  return {
    subject: `Order Cancelled - #${data.poNumber || data.orderId.substring(0, 8)}`,
    html: emailWrapper(content),
  };
}

/**
 * Custom Manual Update Email Template
 */
export function customUpdateEmail(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px; font-weight: 600;">
      Order Update
    </h2>
    
    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.5;">
      Hi ${data.customerName},
    </p>
    
    ${data.customMessage ? `
    <!-- Custom Message Box -->
    <table style="width: 100%; border: 1px solid #3b82f6; border-radius: 8px; margin-bottom: 30px; background-color: #eff6ff;">
      <tr>
        <td style="padding: 20px;">
          <p style="margin: 0; color: #1e40af; font-size: 14px; line-height: 1.6; white-space: pre-line;">
${data.customMessage}
          </p>
        </td>
      </tr>
    </table>
    ` : ''}
    
    <!-- Order Details Box -->
    <table style="width: 100%; border: 1px solid #e5e5e5; border-radius: 8px; margin-bottom: 30px;">
      <tr>
        <td style="padding: 20px; background-color: #f9fafb;">
          <table style="width: 100%;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 40%;">Order ID:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">#${data.poNumber || data.orderId.substring(0, 8)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Status:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${data.status}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
    <!-- CTA Button -->
    <table>
      <tr>
        <td>
          <a href="${data.orderUrl}" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
            View Order Details
          </a>
        </td>
      </tr>
    </table>
  `;

  return {
    subject: `Order Update - #${data.poNumber || data.orderId.substring(0, 8)}`,
    html: emailWrapper(content),
  };
}

