/**
 * NetSuite review — nightly alert (owner 2026-10-08: "alert admin when
 * there is an issue, an error or a mismatch between the Hub and NetSuite";
 * never about things already known).
 *
 * After the nightly sync, one email to Settings → Sales → alert emails with
 * what is NEW since the last email:
 *   - NetSuite documents waiting for a decision (doc:<id>)
 *   - Hub orders NetSuite billed differently — billed less, billed more, or
 *     billed although cancelled (order:<id>:<state>)
 *   - companies whose sync failed (sync:<company>:<day> — daily while failing)
 * Each key is emailed once (sales_review_alerts). The very first run only
 * records what already exists, so known items (e.g. old backorders) never
 * alert. Nothing is recorded when there are no recipients or the email fails,
 * so it goes out on a later night.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendMail } from '../emailService';
import { escapeHtml } from '../htmlEscape';
import { emailButton, emailHeading, emailNote, emailPara, emailWrapper } from '../emailTemplates';
import { reconcileCompany } from './reconcile';
import { isCredit } from './review';
import { loadReviewState, statusesFor, type LoadedDoc, type LoadedOrder, type StoredReview } from './reviewData';

export interface ReviewIssue {
  key: string;
  kind: 'document' | 'order' | 'sync';
  companyId: string;
  company: string;
  text: string; // one line, plain text
}

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DOC_LABEL: Record<string, string> = { invoice: 'Invoice', credit_memo: 'Credit memo', cash_sale: 'Cash sale', cash_refund: 'Cash refund' };
const STATE_LABEL: Record<string, string> = {
  partly_billed: 'billed less than the Hub order',
  billed_more: 'billed more than the Hub order',
  cancelled_but_billed: 'billed although the Hub order is cancelled',
};

/** Everything that currently needs a look (pure). */
export function collectIssues(input: {
  docs: LoadedDoc[];
  orders: LoadedOrder[];
  reviews: Map<string, StoredReview>;
  companyNames: Map<string, string>;
  syncFailures: Array<{ company_id: string; last_error: string }>;
  today: string; // YYYY-MM-DD
}): ReviewIssue[] {
  const { docs, orders, reviews, companyNames, syncFailures, today } = input;
  const name = (id: string) => companyNames.get(id) ?? 'Unknown company';
  const issues: ReviewIssue[] = [];
  const statuses = statusesFor(docs, orders, reviews);

  for (const d of docs) {
    if (statuses.get(d.id) !== 'to_review') continue;
    issues.push({
      key: `doc:${d.id}`,
      kind: 'document',
      companyId: d.company_id,
      company: name(d.company_id),
      text: `${DOC_LABEL[d.doc_type] ?? d.doc_type} ${d.tranid} · ${d.doc_date} · ${money(d.sales_amount)}`,
    });
  }

  // Billing per Hub order: invoices NetSuite linked + invoices an admin attached.
  const byCompany = new Map<string, { orders: LoadedOrder[]; docs: any[] }>();
  for (const o of orders) {
    if (!byCompany.has(o.company_id)) byCompany.set(o.company_id, { orders: [], docs: [] });
    byCompany.get(o.company_id)!.orders.push(o);
  }
  for (const d of docs) {
    if (isCredit(d.doc_type)) continue;
    const r = reviews.get(d.id);
    const orderId = r?.decision === 'attach' && r.order_id ? r.order_id : statuses.get(d.id) === 'auto' ? d.order_id : null;
    if (!orderId) continue;
    if (!byCompany.has(d.company_id)) byCompany.set(d.company_id, { orders: [], docs: [] });
    byCompany.get(d.company_id)!.docs.push({ ...d, order_id: orderId });
  }
  for (const [companyId, group] of byCompany) {
    const recon = reconcileCompany({ contractDate: null, orders: group.orders as any[], documents: group.docs });
    for (const o of recon.orders) {
      if (!STATE_LABEL[o.state]) continue;
      issues.push({
        key: `order:${o.orderId}:${o.state}`,
        kind: 'order',
        companyId,
        company: name(companyId),
        text: `Hub order ${o.poNumber || o.orderId.slice(0, 6)} ${STATE_LABEL[o.state]} (Hub ${money(o.hubTotal)}, NetSuite ${money(o.billed)})`,
      });
    }
  }

  for (const f of syncFailures) {
    issues.push({
      key: `sync:${f.company_id}:${today}`,
      kind: 'sync',
      companyId: f.company_id,
      company: name(f.company_id),
      text: `NetSuite sync failed: ${f.last_error}`,
    });
  }
  return issues;
}

/** The issues not emailed before. */
export function newIssues(issues: ReviewIssue[], alerted: Set<string>): ReviewIssue[] {
  return issues.filter((i) => !alerted.has(i.key));
}

/** The alert email (Hub email blocks; every value escaped). */
export function buildAlertEmail(issues: ReviewIssue[], reviewUrl: string): { subject: string; html: string } {
  const docs = issues.filter((i) => i.kind === 'document');
  const orders = issues.filter((i) => i.kind === 'order');
  const sync = issues.filter((i) => i.kind === 'sync');
  const parts: string[] = [];
  if (docs.length) parts.push(`${docs.length} NetSuite document${docs.length === 1 ? '' : 's'} to decide`);
  if (orders.length) parts.push(`${orders.length} order${orders.length === 1 ? '' : 's'} billed differently`);
  if (sync.length) parts.push(`${sync.length} sync failure${sync.length === 1 ? '' : 's'}`);
  const subject = `NetSuite review: ${parts.join(', ')}`;

  const section = (title: string, list: ReviewIssue[]) => {
    if (!list.length) return '';
    const byCompany = new Map<string, ReviewIssue[]>();
    for (const i of list) byCompany.set(i.company, [...(byCompany.get(i.company) ?? []), i]);
    const items = [...byCompany]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(
        ([company, rows]) =>
          `<li style="margin:0 0 6px;"><strong>${escapeHtml(company)}</strong><ul style="margin:4px 0 0 16px;padding:0;">${rows
            .map((r) => `<li>${escapeHtml(r.text)}</li>`)
            .join('')}</ul></li>`
      )
      .join('');
    return emailNote(`<strong>${escapeHtml(title)}</strong><ul style="margin:8px 0 0 18px;padding:0;">${items}</ul>`);
  };

  const content = `
    ${emailHeading('NetSuite review', 'New since the last check')}
    ${emailPara('Nothing from NetSuite counts toward a client’s sales until it’s decided on the NetSuite review page. Items you already know about are never repeated.')}
    ${section('Waiting for a decision', docs)}
    ${section('Billed differently from the Hub order', orders)}
    ${section('Sync failures', sync)}
    ${emailButton('Open NetSuite review', reviewUrl)}
  `;
  return { subject, html: emailWrapper(content, { footerNote: 'Automated internal notification from the Partners Hub.' }) };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Run after the nightly sync. Never throws for email trouble — reports it. */
export async function runReviewAlerts(
  supabase: SupabaseClient,
  opts: { now?: Date; siteUrl?: string } = {}
): Promise<{ baseline: boolean; issues: number; fresh: number; sentTo: string[]; skipped?: string }> {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const [settingsRes, alertedRes, companiesRes, syncRes, state] = await Promise.all([
    supabase.from('sales_settings').select('alert_emails').eq('id', 1).maybeSingle(),
    supabase.from('sales_review_alerts').select('key').range(0, 99999),
    supabase.from('companies').select('id, company_name').range(0, 9999),
    supabase.from('sales_company_sync').select('company_id, last_error').not('last_error', 'is', null),
    loadReviewState(supabase, null),
  ]);
  for (const r of [settingsRes, alertedRes, companiesRes, syncRes]) if (r.error) throw new Error(r.error.message);

  const issues = collectIssues({
    ...state,
    companyNames: new Map((companiesRes.data ?? []).map((c: any) => [String(c.id), String(c.company_name)])),
    syncFailures: (syncRes.data ?? []) as any[],
    today,
  });
  const alerted = new Set((alertedRes.data ?? []).map((r: any) => String(r.key)));
  const record = async (keys: string[]) => {
    for (let i = 0; i < keys.length; i += 500) {
      const { error } = await supabase
        .from('sales_review_alerts')
        .upsert(keys.slice(i, i + 500).map((key) => ({ key, alerted_at: now.toISOString() })), { onConflict: 'key' });
      if (error) throw new Error(error.message);
    }
  };

  // First run: remember what already exists; known items never alert.
  if (alerted.size === 0) {
    await record(issues.map((i) => i.key));
    return { baseline: true, issues: issues.length, fresh: 0, sentTo: [] };
  }

  const fresh = newIssues(issues, alerted);
  if (!fresh.length) return { baseline: false, issues: issues.length, fresh: 0, sentTo: [] };
  const to = ((settingsRes.data?.alert_emails ?? []) as string[]).filter((e) => EMAIL_RE.test(e));
  if (!to.length) return { baseline: false, issues: issues.length, fresh: fresh.length, sentTo: [], skipped: 'No alert emails in Settings → Sales.' };

  const site = (opts.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://partners.qiqiglobal.com').replace(/\/$/, '');
  const { subject, html } = buildAlertEmail(fresh, `${site}/admin/reports/netsuite-review`);
  const sentTo: string[] = [];
  for (const addr of to) {
    const res = await sendMail({ to: addr, subject, html });
    if (res.success) sentTo.push(addr);
  }
  if (!sentTo.length) return { baseline: false, issues: issues.length, fresh: fresh.length, sentTo, skipped: 'Email failed — will retry tomorrow.' };
  await record(fresh.map((i) => i.key));
  return { baseline: false, issues: issues.length, fresh: fresh.length, sentTo };
}
