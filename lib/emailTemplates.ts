/**
 * Email templates — the Hub's outbound email design system.
 *
 * Redesigned 2026-09-01 (owner-approved, see artifact "Qiqi Email Redesign"):
 * one shared wrapper (logo header over a 2px ink rule, 600px card, real
 * footer) and a small set of blocks — eyebrow+heading, fact card, items
 * table, one black button, quiet note box. No emoji headers, no colored
 * callouts. Table layout + inline styles + system fonts only, so rendering
 * matches across Outlook / Gmail / Apple Mail.
 *
 * The blocks are exported so internal alert emails (Amazon, Shopify,
 * feedback, new-order notification) share the same shell.
 */

import { formatCurrency } from './formatters';
import { escapeHtml, sanitizeEmailHeader } from './htmlEscape';

// ---------------------------------------------------------------------------
// Design tokens (email-safe: literal colors, system font stacks)
// ---------------------------------------------------------------------------
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'Courier New',monospace";
const INK = '#111111';
const BODY = '#44403C';
const MUTED = '#78716C';
const FAINT = '#A8A29E';
const HAIRLINE = '#E7E5E4';
const WASH = '#FAFAF9';
const GROUND = '#F5F5F4';

const LOGO_URL = 'https://partners.qiqiglobal.com/logo.png';

const DEFAULT_FOOTER =
  'Questions about this email? Reply to it — it reaches the team at orders@qiqiglobal.com.';

// ---------------------------------------------------------------------------
// Shared blocks
// ---------------------------------------------------------------------------

/** The shell every Hub email ships in. `content` is trusted template HTML —
 *  every user-supplied value inside it must already be escapeHtml'd. */
export function emailWrapper(content: string, opts?: { footerNote?: string }): string {
  const footerNote = opts?.footerNote ?? DEFAULT_FOOTER;
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Qiqi Partners Hub</title>
</head>
<body style="margin:0;padding:0;background-color:${GROUND};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:${GROUND};padding:0;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:600px;max-width:100%;background:#FFFFFF;border:1px solid ${HAIRLINE};border-radius:8px;overflow:hidden;">
        <tr><td style="padding:28px 40px 24px;border-bottom:2px solid ${INK};">
          <img src="${LOGO_URL}" alt="Qiqi" height="30" style="display:block;height:30px;">
        </td></tr>
        <tr><td style="padding:36px 40px 8px;font-family:${FONT};">
          ${content}
        </td></tr>
        <tr><td style="padding:28px 40px 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${HAIRLINE};">
            <tr><td style="padding:18px 0 0;font-family:${FONT};font-size:12px;line-height:1.7;color:${FAINT};">
              Qiqi Global · Partners Hub<br>
              ${footerNote}
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim();
}

/** Small-caps eyebrow naming the event + the plain-language heading. */
export function emailHeading(eyebrow: string, heading: string): string {
  return `
    <p style="margin:0 0 10px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:2px;color:${MUTED};">${eyebrow.toUpperCase()}</p>
    <h1 style="margin:0 0 14px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:700;color:${INK};">${heading}</h1>
  `;
}

export function emailPara(html: string): string {
  return `<p style="margin:0 0 20px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BODY};">${html}</p>`;
}

export interface FactRow {
  label: string;
  /** Already-escaped HTML value. */
  value: string;
  mono?: boolean;
}

/** The gray facts card: label left, value right. */
export function emailFactCard(rows: FactRow[]): string {
  const body = rows
    .map((r, i) => {
      const padTop = i === 0 ? '16px' : '4px';
      const padBottom = i === rows.length - 1 ? '16px' : '4px';
      const valueStyle = r.mono
        ? `font-family:${MONO};font-size:14px;font-weight:700;`
        : `font-family:${FONT};font-size:13px;${i === 0 ? 'font-weight:600;' : ''}`;
      return `
        <tr>
          <td style="padding:${padTop} 20px ${padBottom};font-family:${FONT};font-size:13px;color:${MUTED};">${escapeHtml(r.label)}</td>
          <td style="padding:${padTop} 20px ${padBottom};${valueStyle}color:${INK};text-align:right;">${r.value}</td>
        </tr>`;
    })
    .join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${WASH};border:1px solid ${HAIRLINE};border-radius:6px;margin:0 0 4px;">
      ${body}
    </table>
  `;
}

/** Order line items with a strong total rule. */
export function emailItemsTable(
  items: Array<{ productName: string; quantity: number; totalPrice: number }>,
  totalAmount?: number,
): string {
  if (!items.length) return '';
  const rows = items
    .map((item, i) => {
      const border = i < items.length - 1 ? `border-bottom:1px solid ${HAIRLINE};` : '';
      return `
        <tr>
          <td style="padding:8px 0;font-family:${FONT};font-size:14px;color:${BODY};${border}">${escapeHtml(item.productName)}</td>
          <td style="padding:8px 0;font-family:${FONT};font-size:14px;color:${MUTED};text-align:center;white-space:nowrap;${border}">${escapeHtml(item.quantity)}</td>
          <td style="padding:8px 0;font-family:${FONT};font-size:14px;color:${INK};text-align:right;white-space:nowrap;${border}">${escapeHtml(formatCurrency(item.totalPrice))}</td>
        </tr>`;
    })
    .join('');
  const total =
    totalAmount != null
      ? `
        <tr>
          <td colspan="2" style="padding:12px 0 0;font-family:${FONT};font-size:14px;font-weight:700;color:${INK};border-top:2px solid ${INK};">Order total</td>
          <td style="padding:12px 0 0;font-family:${FONT};font-size:16px;font-weight:700;color:${INK};text-align:right;border-top:2px solid ${INK};white-space:nowrap;">${escapeHtml(formatCurrency(totalAmount))}</td>
        </tr>`
      : '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0 4px;">
      ${rows}
      ${total}
    </table>
  `;
}

/** The single black action button, with a plain-link fallback underneath. */
export function emailButton(label: string, url: string, fallbackLabel = 'Open it in your browser'): string {
  const safeUrl = escapeHtml(url);
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td align="center" style="padding:28px 0 8px;">
        <a href="${safeUrl}" style="display:inline-block;background:${INK};color:#FFFFFF;font-family:${FONT};font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:6px;">${escapeHtml(label)}</a>
        <p style="margin:12px 0 0;font-family:${FONT};font-size:12px;color:${FAINT};">Button not working? <a href="${safeUrl}" style="color:${MUTED};">${escapeHtml(fallbackLabel)}</a></p>
      </td></tr>
    </table>
  `;
}

/** Quiet gray note box for secondary information. `html` is trusted template
 *  HTML — escape user values before passing them in. */
export function emailNote(html: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${WASH};border:1px solid ${HAIRLINE};border-radius:6px;margin:16px 0 4px;">
      <tr><td style="padding:14px 20px;font-family:${FONT};font-size:12.5px;line-height:1.7;color:${MUTED};">${html}</td></tr>
    </table>
  `;
}

/** The scanner-proof fallback block used under set-password buttons. */
function linkFallbackNote(url: string): string {
  const safeUrl = escapeHtml(url);
  return emailNote(`
    <strong style="color:${BODY};">If the button doesn't work</strong> (common in Outlook): copy this link into your browser instead —<br>
    <a href="${safeUrl}" style="color:${MUTED};word-break:break-all;font-family:${MONO};font-size:11.5px;">${safeUrl}</a>
  `);
}

// ---------------------------------------------------------------------------
// Order lifecycle templates
// ---------------------------------------------------------------------------

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

function orderUrl(data: OrderEmailData): string {
  return `${data.siteUrl}/client/orders/${data.orderId}`;
}

function orderFacts(data: OrderEmailData, extra: FactRow[] = []): string {
  const rows: FactRow[] = [
    { label: 'PO number', value: escapeHtml(data.poNumber) },
    ...(data.soNumber ? [{ label: 'Sales order', value: escapeHtml(data.soNumber) }] : []),
    { label: 'Company', value: escapeHtml(data.companyName) },
    ...extra,
  ];
  return emailFactCard(rows);
}

/** Order Created — sent to the client right after they place an order. */
export function orderCreatedTemplate(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    ${emailHeading('Order received', "We've got your order")}
    ${emailPara(
      `Order <strong>${escapeHtml(data.poNumber)}</strong> for ${escapeHtml(data.companyName)} was received and is waiting for review by the Qiqi team. We'll email you as soon as it's accepted.`,
    )}
    ${orderFacts(data)}
    ${data.items && data.items.length > 0 ? emailItemsTable(data.items, data.totalAmount) : ''}
    ${emailButton('View your order', orderUrl(data))}
  `;
  return {
    subject: `Order ${sanitizeEmailHeader(data.poNumber)} received — Qiqi Partners Hub`,
    html: emailWrapper(content),
  };
}

/** Order In Process — sent when the order is accepted into fulfillment. */
export function orderInProcessTemplate(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    ${emailHeading('Order accepted', 'Your order is in process')}
    ${emailPara(
      `Order <strong>${escapeHtml(data.poNumber)}</strong> was accepted and sent to fulfillment. We'll let you know the moment it's packed and ready.`,
    )}
    ${orderFacts(data)}
    ${emailButton('Track your order', orderUrl(data))}
  `;
  return {
    subject: `Your order ${sanitizeEmailHeader(data.soNumber || data.poNumber)} is being processed`,
    html: emailWrapper(content),
  };
}

/** Order Ready — the automation email, sent when the warehouse finishes packing. */
export function orderReadyTemplate(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    ${emailHeading('Ready for pickup', 'Your order is packed and ready')}
    ${emailPara(
      `The warehouse has finished packing order <strong>${escapeHtml(data.poNumber)}</strong>. It's ready for your freight forwarder to collect — share the reference below when booking the pickup.`,
    )}
    ${emailFactCard([
      ...(data.soNumber
        ? [{ label: 'Pickup reference', value: escapeHtml(data.soNumber), mono: true }]
        : [{ label: 'PO number', value: escapeHtml(data.poNumber), mono: true }]),
      { label: 'Company', value: escapeHtml(data.companyName) },
      { label: 'Invoice', value: 'Available on your order page' },
    ])}
    ${emailButton('View order & invoice', orderUrl(data))}
  `;
  return {
    subject: `Order ${sanitizeEmailHeader(data.soNumber || data.poNumber)} is ready for pickup`,
    html: emailWrapper(content),
  };
}

/** Order Cancelled. */
export function orderCancelledTemplate(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    ${emailHeading('Order cancelled', 'Your order was cancelled')}
    ${emailPara(
      `Order <strong>${escapeHtml(data.poNumber)}</strong> has been cancelled. If this is unexpected, reply to this email and we'll sort it out.`,
    )}
    ${orderFacts(data)}
    ${emailButton('View the order', orderUrl(data))}
  `;
  return {
    subject: `Order ${sanitizeEmailHeader(data.soNumber || data.poNumber)} has been cancelled`,
    html: emailWrapper(content),
  };
}

/** Custom Update — an admin-written message about the order (also carries the
 *  request-changes / stock-shortage flow). */
export function customUpdateTemplate(data: OrderEmailData): { subject: string; html: string } {
  const message = data.customMessage
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${WASH};border-left:3px solid ${INK};border-radius:0 6px 6px 0;margin:0 0 20px;">
        <tr><td style="padding:16px 20px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BODY};">${escapeHtml(data.customMessage)}</td></tr>
      </table>`
    : '';
  const content = `
    ${emailHeading('Order update', `A message about order ${escapeHtml(data.poNumber)}`)}
    ${message}
    ${orderFacts(data, [{ label: 'Status', value: escapeHtml(data.status) }])}
    ${emailButton('View your order', orderUrl(data))}
  `;
  return {
    subject: `Order Update - ${sanitizeEmailHeader(data.poNumber)}`,
    html: emailWrapper(content),
  };
}

/** Order Updated — sent after the client (or Qiqi) edits an order. */
export function orderUpdatedTemplate(data: OrderEmailData): { subject: string; html: string } {
  const content = `
    ${emailHeading('Order updated', 'Your order was updated')}
    ${emailPara(
      `Order <strong>${escapeHtml(data.poNumber)}</strong> was updated. The latest items and totals are on your order page.`,
    )}
    ${orderFacts(data, [
      { label: 'Status', value: escapeHtml(data.status) },
      ...(data.totalAmount != null
        ? [{ label: 'Order total', value: escapeHtml(formatCurrency(data.totalAmount)) }]
        : []),
    ])}
    ${emailButton('View the updated order', orderUrl(data))}
  `;
  return {
    subject: `Order ${sanitizeEmailHeader(data.poNumber)} Updated - Qiqi Partners Hub`,
    html: emailWrapper(content),
  };
}

// ---------------------------------------------------------------------------
// Account templates
// ---------------------------------------------------------------------------

/** Welcome / Password Setup — new client user. */
export function welcomeEmailTemplate(data: {
  userName: string;
  userEmail: string;
  companyName: string;
  setupLink: string;
  siteUrl: string;
}): { subject: string; html: string } {
  const content = `
    ${emailHeading('Welcome', 'Your Partners Hub account is ready')}
    ${emailPara(
      `Hi ${escapeHtml(data.userName)} — an account was created for you at ${escapeHtml(data.companyName)}. One step left: choose your password. The link below works for 24 hours.`,
    )}
    ${emailFactCard([{ label: "You'll sign in as", value: escapeHtml(data.userEmail), mono: true }])}
    ${emailButton('Set my password', data.setupLink)}
    ${linkFallbackNote(data.setupLink)}
  `;
  return {
    subject: `Welcome to Qiqi Partners Hub - Set Your Password`,
    html: emailWrapper(content, {
      footerNote:
        'Nobody at Qiqi will ever ask you for this link or your password. If the link expires, your account manager can send a new one.',
    }),
  };
}

/** Admin Welcome — the admin counterpart of welcomeEmailTemplate. */
export function adminWelcomeEmailTemplate(data: {
  userName: string;
  userEmail: string;
  setupLink: string;
  siteUrl: string;
}): { subject: string; html: string } {
  const content = `
    ${emailHeading('Welcome', 'Your Qiqi Hub admin account')}
    ${emailPara(
      `Hi ${escapeHtml(data.userName)} — an <strong>administrator account</strong> was created for you on the Qiqi Hub. Choose your password with the link below (valid for 24 hours). After your first sign-in you'll be asked to set up two-factor authentication.`,
    )}
    ${emailFactCard([{ label: "You'll sign in as", value: escapeHtml(data.userEmail), mono: true }])}
    ${emailButton('Set my password', data.setupLink)}
    ${linkFallbackNote(data.setupLink)}
  `;
  return {
    subject: `Your Qiqi Hub admin account - Set Your Password`,
    html: emailWrapper(content, {
      footerNote:
        'Nobody at Qiqi will ever ask you for this link or your password. If the link expires, another administrator can send a new one.',
    }),
  };
}

/** Password Reset. */
export function passwordResetEmailTemplate(data: {
  userName: string;
  userEmail: string;
  resetLink: string;
  siteUrl: string;
}): { subject: string; html: string } {
  const content = `
    ${emailHeading('Password reset', 'Reset your password')}
    ${emailPara(
      `Hi ${escapeHtml(data.userName)} — we received a request to reset the password for your Qiqi Partners Hub account. The link below works for 24 hours.`,
    )}
    ${emailFactCard([{ label: 'Account', value: escapeHtml(data.userEmail), mono: true }])}
    ${emailButton('Reset my password', data.resetLink)}
    ${linkFallbackNote(data.resetLink)}
    ${emailNote(
      `<strong style="color:${BODY};">Didn't request this?</strong> You can safely ignore this email — your password stays unchanged.`,
    )}
  `;
  return {
    subject: `Reset Your Password - Qiqi Partners Hub`,
    html: emailWrapper(content),
  };
}

/**
 * One-time login code email — for clients who want to log in without their
 * password. Code is 6 digits, valid for 10 minutes; we never send a clickable
 * login link (avoids link-scanner consumption).
 */
export function loginCodeEmailTemplate(data: {
  userName: string;
  userEmail: string;
  code: string;
  siteUrl: string;
}): { subject: string; html: string } {
  const content = `
    ${emailHeading('Sign in', 'Your login code')}
    ${emailPara(
      `Hi ${escapeHtml(data.userName)} — enter this code on the "Sign in with code" screen. It's valid for <strong>10 minutes</strong>.`,
    )}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td align="center" style="padding:8px 0 4px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${WASH};border:2px solid ${INK};border-radius:8px;">
          <tr><td style="padding:20px 36px;text-align:center;">
            <p style="margin:0 0 4px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:2px;color:${MUTED};">YOUR CODE</p>
            <p style="margin:0;font-family:${MONO};font-size:34px;font-weight:700;letter-spacing:8px;color:${INK};">${escapeHtml(data.code)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
    ${emailNote(
      `<strong style="color:${BODY};">Didn't request this code?</strong> You can safely ignore this email — the code expires on its own.`,
    )}
  `;
  return {
    subject: `Your Qiqi Partners Hub login code: ${data.code}`,
    html: emailWrapper(content),
  };
}
