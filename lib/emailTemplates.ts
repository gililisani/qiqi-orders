/**
 * Email Templates - HTML templates for order notifications
 * 
 * This module contains all email templates used for order notifications.
 */

import { formatCurrency, formatQuantity } from './formatters';

interface OrderEmailData {
  poNumber: string; // Use PO number as the main order identifier
  orderId: string;
  companyName: string;
  status: string;
  soNumber?: string;
  totalAmount?: number;
  items?: Array<{
    productName: string;
    quantity: number;
    totalPrice: number;
  }>;
  customMessage?: string;
  siteUrl: string;
}

/**
 * Base email template wrapper
 */
function emailWrapper(content: string, siteUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Qiqi Orders Notification</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header with Logo -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px 30px; text-align: center;">
              <img src="https://partners.qiqiglobal.com/logo.png" alt="Qiqi" style="height: 50px; width: auto; display: block; margin: 0 auto;" />
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Order Created Email Template
 */
export function orderCreatedTemplate(data: OrderEmailData): { subject: string; html: string } {
  const itemsHtml = data.items
    ?.map(
      (item) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${item.productName}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${item.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      `
    )
    .join('');

  const content = `
    <h2 style="margin: 0 0 20px; color: #000000; font-size: 22px; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb;">Order Confirmation</h2>
    
    <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
      Your order <strong>${data.poNumber}</strong> has been successfully created and is being processed.
    </p>
    
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #f8f9fa; border-radius: 6px; padding: 20px;">
      <tr>
        <td>
          <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>Company:</strong> ${data.companyName}</p>
          <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>Status:</strong> ${data.status}</p>
          ${data.poNumber ? `<p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>PO Number:</strong> ${data.poNumber}</p>` : ''}
          ${data.soNumber ? `<p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>SO Number:</strong> ${data.soNumber}</p>` : ''}
        </td>
      </tr>
    </table>
    
    ${
      data.items && data.items.length > 0
        ? `
    <h3 style="margin: 30px 0 15px; color: #1e293b; font-size: 18px;">Order Items</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
      <thead>
        <tr style="background-color: #f8f9fa;">
          <th style="padding: 12px; text-align: left; color: #374151; font-size: 14px; font-weight: 600;">Product</th>
          <th style="padding: 12px; text-align: center; color: #374151; font-size: 14px; font-weight: 600;">Quantity</th>
                            <th style="padding: 12px; text-align: right; color: #374151; font-size: 14px; font-weight: 600;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      ${
        data.totalAmount
          ? `
      <tfoot>
        <tr style="background-color: #f8f9fa;">
          <td colspan="2" style="padding: 12px; text-align: right; color: #374151; font-size: 16px; font-weight: 600;">Total:</td>
          <td style="padding: 12px; text-align: right; color: #374151; font-size: 16px; font-weight: 600;">$${data.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      </tfoot>
      `
          : ''
      }
    </table>
    `
        : ''
    }
    
    <div style="margin: 30px 0; text-align: center;">
      <a href="${data.siteUrl}/client/orders/${data.orderId}" 
         style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
        View Order Details
      </a>
    </div>
    
    <p style="margin: 20px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
      We will notify you when your order status changes. If you have any questions, please contact our support team.
    </p>
  `;

  return {
    subject: `New Order created`,
    html: emailWrapper(content, data.siteUrl),
  };
}

/**
 * Order In Process Email Template
 */
export function orderInProcessTemplate(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    <h2 style="margin: 0 0 20px; color: #000000; font-size: 22px; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb;">Order In Process</h2>
    
    <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
      Great news! Your order <strong>${data.poNumber}</strong> is now being processed.
    </p>
    
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #f8f9fa; border-radius: 6px; padding: 20px;">
      <tr>
        <td>
          <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>Company:</strong> ${data.companyName}</p>
            <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>Status:</strong> <span style="color: #000000;">In Process</span></p>
          ${data.poNumber ? `<p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>PO Number:</strong> ${data.poNumber}</p>` : ''}
          ${data.soNumber ? `<p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>SO Number:</strong> ${data.soNumber}</p>` : ''}
        </td>
      </tr>
    </table>
    
    <p style="margin: 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      We're working on your order and will notify you once it's ready for pickup/delivery.
    </p>
    
    <div style="margin: 30px 0; text-align: center;">
      <a href="${data.siteUrl}/client/orders/${data.orderId}" 
         style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
        Track Order Status
      </a>
    </div>
  `;

  return {
    subject: `Your order ${data.soNumber || data.poNumber} is being processed`,
    html: emailWrapper(content, data.siteUrl),
  };
}

/**
 * Order Ready Email Template
 */
export function orderReadyTemplate(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    <h2 style="margin: 0 0 20px; color: #000000; font-size: 22px; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb;">Order Ready!</h2>
    
    <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
      Excellent news! Your order <strong>${data.soNumber || data.poNumber}</strong> is now ready for pickup. You may Edit and/or Print your packing slip.
    </p>
    
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #f8f9fa; border-radius: 6px; padding: 20px;">
      <tr>
        <td>
          <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>Company:</strong> ${data.companyName}</p>
            <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>Status:</strong> <span style="color: #000000;">Ready</span></p>
          ${data.poNumber ? `<p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>PO Number:</strong> ${data.poNumber}</p>` : ''}
          ${data.soNumber ? `<p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>SO Number:</strong> ${data.soNumber}</p>` : ''}
        </td>
      </tr>
    </table>
    
    <p style="margin: 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      Please contact us to arrange pickup or confirm delivery details.
    </p>
    
    <div style="margin: 30px 0; text-align: center;">
      <a href="${data.siteUrl}/client/orders/${data.orderId}" 
         style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
        View Order Details
      </a>
    </div>
  `;

  return {
    subject: `Order ${data.soNumber || data.poNumber} is ready for pickup!`,
    html: emailWrapper(content, data.siteUrl),
  };
}

/**
 * Order Cancelled Email Template
 */
export function orderCancelledTemplate(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    <h2 style="margin: 0 0 20px; color: #000000; font-size: 22px; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb;">Order Cancelled</h2>
    
    <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
      Your order <strong>${data.poNumber}</strong> has been cancelled.
    </p>
    
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #f8f9fa; border-radius: 6px; padding: 20px;">
      <tr>
        <td>
          <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>Company:</strong> ${data.companyName}</p>
            <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>Status:</strong> <span style="color: #000000;">Cancelled</span></p>
          ${data.poNumber ? `<p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>PO Number:</strong> ${data.poNumber}</p>` : ''}
          ${data.soNumber ? `<p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>SO Number:</strong> ${data.soNumber}</p>` : ''}
        </td>
      </tr>
    </table>
    
    <p style="margin: 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
      If you have any questions about this cancellation, please contact our support team.
    </p>
    
    <div style="margin: 30px 0; text-align: center;">
      <a href="${data.siteUrl}/client/orders/${data.orderId}" 
         style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
        View Order Details
      </a>
    </div>
  `;

  return {
    subject: `Order ${data.soNumber || data.poNumber} has been cancelled`,
    html: emailWrapper(content, data.siteUrl),
  };
}

/**
 * Welcome Email Template (for new users)
 */
export function welcomeUserTemplate(data: {
  userName: string;
  userEmail: string;
  temporaryPassword: string;
  companyName: string;
  siteUrl: string;
}): { subject: string; html: string } {
  const content = `
    <h2 style="margin: 0 0 20px; color: #000000; font-size: 22px; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb;">Welcome to Qiqi Partners Portal</h2>
    
    <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
      Hello <strong>${data.userName}</strong>,
    </p>
    
    <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
      Your account has been created for <strong>${data.companyName}</strong>. You can now access the Qiqi Partners Portal to manage your orders.
    </p>
    
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #f8f9fa; border-radius: 6px; padding: 20px;">
      <tr>
        <td>
          <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>Login Email:</strong> ${data.userEmail}</p>
          <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>Temporary Password:</strong> <code style="background: #ffffff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e5e7eb;">${data.temporaryPassword}</code></p>
          <p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>Portal URL:</strong> <a href="${data.siteUrl}" style="color: #000000;">${data.siteUrl}</a></p>
        </td>
      </tr>
    </table>
    
    <div style="margin: 20px 0; padding: 15px; background-color: #fff7ed; border-left: 4px solid #f97316; border-radius: 6px;">
      <p style="margin: 0; color: #9a3412; font-size: 14px; line-height: 1.6;">
        <strong>⚠️ Important:</strong> You will be required to change your password on your first login for security purposes.
      </p>
    </div>
    
    <div style="margin: 30px 0; text-align: center;">
      <a href="${data.siteUrl}" 
         style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
        Login to Portal
      </a>
    </div>
    
    <p style="margin: 20px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
      If you have any questions, please contact our support team.
    </p>
  `;

  return {
    subject: `Welcome to Qiqi Partners Portal`,
    html: emailWrapper(content, data.siteUrl),
  };
}

/**
 * Custom Update Email Template
 */
export function customUpdateTemplate(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    <h2 style="margin: 0 0 20px; color: #000000; font-size: 22px; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb;">Order Update</h2>
    
    <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
      We have an update regarding your order <strong>${data.poNumber}</strong>.
    </p>
    
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #f8f9fa; border-radius: 6px; padding: 20px;">
      <tr>
        <td>
          <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>Company:</strong> ${data.companyName}</p>
          <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>Status:</strong> ${data.status}</p>
          ${data.poNumber ? `<p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>PO Number:</strong> ${data.poNumber}</p>` : ''}
          ${data.soNumber ? `<p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>SO Number:</strong> ${data.soNumber}</p>` : ''}
        </td>
      </tr>
    </table>
    
    ${
      data.customMessage
        ? `
    <div style="margin: 20px 0; padding: 20px; background-color: #f8f9fa; border-left: 4px solid #000000; border-radius: 6px;">
      <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.6;">
        ${data.customMessage}
      </p>
    </div>
    `
        : ''
    }
    
    <div style="margin: 30px 0; text-align: center;">
      <a href="${data.siteUrl}/client/orders/${data.orderId}" 
         style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
        View Order Details
      </a>
    </div>
    
    <p style="margin: 20px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
      If you have any questions, please contact our support team.
    </p>
  `;

  return {
    subject: `Order Update - ${data.poNumber}`,
    html: emailWrapper(content, data.siteUrl),
  };
}
