/**
 * Error alerting — the anti-"bookkeeper finds it months later" mechanism.
 * Daily digest when parked errors exist; immediate (throttled) mail when
 * the poller itself fails. Uses the HUB's Graph mailer; silently no-ops
 * when ALERT_EMAIL or Graph isn't configured (staging).
 */
import { sendMail } from '../emailService';
import { escapeHtml } from '../htmlEscape';
import { emailWrapper, emailHeading, emailButton, emailNote } from '../emailTemplates';
import type { ShopifySyncStore } from './store';

const DIGEST_MIN_INTERVAL_MS = 20 * 3600_000; // ~daily
const FAILURE_MIN_INTERVAL_MS = 2 * 3600_000; // poll failures: at most every 2h

function alertRecipient(): string | null {
  return process.env.SHOPIFY_SYNC_ALERT_EMAIL || null;
}

async function throttled(store: ShopifySyncStore, minIntervalMs: number): Promise<boolean> {
  const config = await store.getConfig();
  const last = (config as any).last_digest_at ? new Date((config as any).last_digest_at).getTime() : 0;
  if (Date.now() - last < minIntervalMs) return false;
  await store.updateConfig({ last_digest_at: new Date().toISOString() } as any);
  return true;
}

export async function maybeSendErrorDigest(
  store: ShopifySyncStore,
  errors: Array<{ order_name: string; error_code: string | null; error_message: string | null }>,
): Promise<void> {
  const to = alertRecipient();
  if (!to || errors.length === 0 || !process.env.AZURE_CLIENT_ID) return;
  if (!(await throttled(store, DIGEST_MIN_INTERVAL_MS))) return;

  const rows = errors
    .slice(0, 20)
    .map(
      (e) =>
        `<tr><td style="padding:6px 8px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#111111;border-bottom:1px solid #E7E5E4;">${escapeHtml(e.order_name)}</td>` +
        `<td style="padding:6px 8px;font-family:'Courier New',monospace;font-size:12px;color:#44403C;border-bottom:1px solid #E7E5E4;">${escapeHtml(e.error_code ?? '')}</td>` +
        `<td style="padding:6px 8px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#78716C;border-bottom:1px solid #E7E5E4;">${escapeHtml((e.error_message ?? '').slice(0, 140))}</td></tr>`,
    )
    .join('');
  const content = `
    ${emailHeading('Shopify sync', `${errors.length} order${errors.length === 1 ? '' : 's'} need attention`)}
    ${emailNote(`${errors.length} Shopify order${errors.length === 1 ? ' is' : 's are'} parked in the sync error queue.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0 4px;">${rows}</table>
    ${emailButton('Open Shopify Sync to fix and retry', 'https://partners.qiqiglobal.com/admin/shopify')}
  `;
  await sendMail({
    to,
    subject: `Shopify sync: ${errors.length} order(s) need attention`,
    html: emailWrapper(content, { footerNote: 'Automated internal notification from the Qiqi Partners Hub.' }),
  }).catch((e) => console.error('[shopify-alerts] digest failed:', String(e?.message ?? e)));
}

export async function maybeSendPollFailure(store: ShopifySyncStore, message: string): Promise<void> {
  const to = alertRecipient();
  if (!to || !process.env.AZURE_CLIENT_ID) return;
  if (!(await throttled(store, FAILURE_MIN_INTERVAL_MS))) return;
  const content = `
    ${emailHeading('Shopify sync', 'The order poller failed')}
    ${emailNote(`<strong>Error:</strong><br><span style="font-family:'Courier New',monospace;font-size:12px;word-break:break-word;">${escapeHtml(message.slice(0, 800))}</span>`)}
    ${emailNote('Orders are not being synced until this is resolved.')}
    ${emailButton('Open Shopify Sync', 'https://partners.qiqiglobal.com/admin/shopify')}
  `;
  await sendMail({
    to,
    subject: 'Shopify sync: poll FAILED',
    html: emailWrapper(content, { footerNote: 'Automated internal notification from the Qiqi Partners Hub.' }),
  }).catch((e) => console.error('[shopify-alerts] failure mail failed:', String(e?.message ?? e)));
}
