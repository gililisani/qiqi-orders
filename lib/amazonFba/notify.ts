/**
 * Email notifications for the Amazon FBA monthly automation.
 * Sent via the existing Microsoft Graph service (orders@qiqiglobal.com).
 */

import { sendMail } from '../emailService';
import { escapeHtml } from '../htmlEscape';
import type { MonthPreview } from './parseReport';
import type { PushStepResult } from './pushToNetSuite';

const money = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function totalsTable(preview: MonthPreview): string {
  const rows: [string, string][] = [
    ['Gross sales', money(preview.grossSales)],
    ['Seller-funded promotions', money(preview.discountTotal)],
    ['Refunds', money(preview.refundTotal)],
    ['Amazon fees', money(-preview.feeTotal)],
    ['Reimbursements', money(preview.reimbursementTotal)],
    ['Net', money(preview.computedNet)],
    ['Orders', String(preview.orderCount)],
  ];
  return `<table cellpadding="6" style="border-collapse:collapse">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="border:1px solid #ddd">${escapeHtml(label)}</td><td style="border:1px solid #ddd;text-align:right;font-family:monospace">${escapeHtml(value)}</td></tr>`
    )
    .join('')}</table>`;
}

const PAGE_URL = 'https://partners.qiqiglobal.com/admin/netsuite/amazon-fba';

export async function notifyMonthPrepared(
  notifyEmail: string,
  preview: MonthPreview,
  options?: { reminder?: boolean }
): Promise<void> {
  const ready = preview.reconciles;
  const prefix = options?.reminder ? 'Reminder: ' : '';
  const subject = ready
    ? `${prefix}Amazon ${preview.periodLabel} is ready to push to NetSuite`
    : `${prefix}Amazon ${preview.periodLabel} needs attention before pushing`;
  const attention = preview.needsAttention
    .map((a) => `<li>${escapeHtml(a.reason)}: ${escapeHtml(a.row.product)} (${escapeHtml(a.row.orderId || '—')})</li>`)
    .join('');
  const html = `
    <p>The Hub fetched <strong>${escapeHtml(preview.periodLabel)}</strong> from Amazon:</p>
    ${totalsTable(preview)}
    ${ready
      ? '<p>Everything reconciles. Review and push:</p>'
      : `<p>The following must be resolved first:</p><ul>${attention}</ul>`}
    <p><a href="${PAGE_URL}">Open the Amazon FBA page</a></p>`;
  await sendMail({ to: notifyEmail, subject, html });
}

export async function notifyMonthPushed(
  notifyEmail: string,
  preview: MonthPreview,
  results: PushStepResult[]
): Promise<void> {
  const lines = results
    .filter((r) => r.status !== 'skipped')
    .map((r) => `<li>${escapeHtml(r.step)}: ${escapeHtml(r.tranId || r.nsId || '')} (${escapeHtml(r.status)})</li>`)
    .join('');
  const html = `
    <p><strong>${escapeHtml(preview.periodLabel)}</strong> was pushed to NetSuite automatically:</p>
    ${totalsTable(preview)}
    <ul>${lines}</ul>
    <p><a href="${PAGE_URL}">Open the Amazon FBA page</a></p>`;
  await sendMail({
    to: notifyEmail,
    subject: `Amazon ${preview.periodLabel} pushed to NetSuite automatically`,
    html,
  });
}

export async function notifyMonthFailed(
  notifyEmail: string,
  periodLabel: string,
  errorMessage: string
): Promise<void> {
  const html = `
    <p>The automatic Amazon import for <strong>${escapeHtml(periodLabel)}</strong> hit a problem:</p>
    <p style="color:#b00">${escapeHtml(errorMessage)}</p>
    <p>Nothing was double-booked — records already created are kept and retrying only creates what's missing.</p>
    <p><a href="${PAGE_URL}">Open the Amazon FBA page to fix and retry</a></p>`;
  await sendMail({
    to: notifyEmail,
    subject: `Amazon ${periodLabel} import needs help`,
    html,
  });
}
