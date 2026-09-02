/**
 * Email notifications for the Amazon FBA monthly automation.
 * Sent via the existing Microsoft Graph service (orders@qiqiglobal.com),
 * in the shared Hub email design (lib/emailTemplates.ts blocks).
 */

import { sendMail } from '../emailService';
import { escapeHtml } from '../htmlEscape';
import {
  emailWrapper,
  emailHeading,
  emailFactCard,
  emailButton,
  emailNote,
  type FactRow,
} from '../emailTemplates';
import type { MonthPreview } from './parseReport';
import type { PushStepResult } from './pushToNetSuite';

const money = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const INTERNAL_FOOTER = { footerNote: 'Automated internal notification from the Qiqi Partners Hub.' };

function totalsCard(preview: MonthPreview): string {
  const rows: FactRow[] = [
    { label: 'Gross sales', value: escapeHtml(money(preview.grossSales)), mono: true },
    { label: 'Seller-funded promotions', value: escapeHtml(money(preview.discountTotal)), mono: true },
    { label: 'Refunds', value: escapeHtml(money(preview.refundTotal)), mono: true },
    { label: 'Amazon fees', value: escapeHtml(money(-preview.feeTotal)), mono: true },
    { label: 'Reimbursements', value: escapeHtml(money(preview.reimbursementTotal)), mono: true },
    { label: 'Net', value: escapeHtml(money(preview.computedNet)), mono: true },
    { label: 'Orders', value: escapeHtml(String(preview.orderCount)) },
  ];
  if (preview.returns) {
    rows.push({
      label: 'Physical returns',
      value: escapeHtml(`${preview.returns.restockUnits} restock, ${preview.returns.nonRestockUnits} damaged`),
    });
  } else if (preview.returnsError) {
    rows.push({ label: 'Physical returns', value: 'report unavailable — money-only push' });
  }
  return emailFactCard(rows);
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
  const content = `
    ${emailHeading('Amazon FBA', ready ? `${preview.periodLabel} is ready to push` : `${preview.periodLabel} needs attention`)}
    ${totalsCard(preview)}
    ${
      ready
        ? emailNote('Everything reconciles. Review and push from the Amazon FBA page.')
        : emailNote(`<strong>Resolve these before pushing:</strong><ul style="margin:8px 0 0 18px;padding:0;">${attention}</ul>`)
    }
    ${emailButton('Open the Amazon FBA page', PAGE_URL)}
  `;
  await sendMail({ to: notifyEmail, subject, html: emailWrapper(content, INTERNAL_FOOTER) });
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
  const content = `
    ${emailHeading('Amazon FBA', `${preview.periodLabel} pushed to NetSuite`)}
    ${totalsCard(preview)}
    ${emailNote(`<strong>Records created:</strong><ul style="margin:8px 0 0 18px;padding:0;">${lines}</ul>`)}
    ${emailButton('Open the Amazon FBA page', PAGE_URL)}
  `;
  await sendMail({
    to: notifyEmail,
    subject: `Amazon ${preview.periodLabel} pushed to NetSuite automatically`,
    html: emailWrapper(content, INTERNAL_FOOTER),
  });
}

export async function notifyMonthFailed(
  notifyEmail: string,
  periodLabel: string,
  errorMessage: string
): Promise<void> {
  const content = `
    ${emailHeading('Amazon FBA', `${periodLabel} import needs help`)}
    ${emailNote(`<strong>The automatic import hit a problem:</strong><br>${escapeHtml(errorMessage)}`)}
    ${emailNote("Nothing was double-booked — records already created are kept, and retrying only creates what's missing.")}
    ${emailButton('Open the Amazon FBA page to fix and retry', PAGE_URL)}
  `;
  await sendMail({
    to: notifyEmail,
    subject: `Amazon ${periodLabel} import needs help`,
    html: emailWrapper(content, INTERNAL_FOOTER),
  });
}
