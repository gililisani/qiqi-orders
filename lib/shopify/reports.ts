/**
 * Finance reports (CPA verification layer, owner directive 2026-08-24):
 * the raw monthly/range reports the bookkeeper would download from
 * Shopify, PayPal and Affirm — generated from each provider's official
 * API, shaped like the export she knows, served from the Hub. Used for
 * NetSuite's Reconcile Account Statement + audit evidence archive.
 * Pure renderers (tested) + thin fetch wrappers.
 */
import { storeDate } from './core/dates';
import type { ShopifyBalanceTxn } from './core/payoutTransform';
import type { PaypalTxn } from './gateways/paypal';
import type { AffirmEvent } from './gateways/affirm';
import { fetchBalanceTransactions, fetchPayoutIssueDates } from './statementFetch';
import { fetchPaypalTransactions } from './gateways/paypal';
import { fetchAffirmEvents } from './gateways/affirm';

export type ReportProvider = 'shopify' | 'paypal' | 'affirm';
export const REPORT_PROVIDERS: ReportProvider[] = ['shopify', 'paypal', 'affirm'];

const esc = (v: string | number | null | undefined): string => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (cells: Array<string | number | null | undefined>) => cells.map(esc).join(',');
const usd = (cents: number) => (cents / 100).toFixed(2);

export function renderShopifyReportCsv(txns: ShopifyBalanceTxn[], payoutDates: Map<string, string>, window: { from: string; to: string }): string {
  const lines = [row(['Transaction Date', 'Type', 'Order', 'Amount', 'Fee', 'Net', 'Payout Date', 'Payout ID', 'Transaction ID'])];
  const inWindow = (d: string) => d >= window.from && d <= window.to;
  for (const t of txns) {
    if (t.test) continue;
    const d = storeDate(t.transactionDate);
    if (!inWindow(d)) continue;
    const pid = t.associatedPayout?.id ?? null;
    lines.push(row([
      d,
      t.type.toLowerCase(),
      t.associatedOrder?.name ?? '',
      t.amount.amount,
      t.fee.amount,
      t.net.amount,
      pid ? payoutDates.get(pid) ?? '' : '',
      pid ? pid.replace(/^.*\//, '') : '',
      t.id.replace(/^.*\//, ''),
    ]));
  }
  return lines.join('\n') + '\n';
}

const PP_TYPE: Array<[RegExp, string]> = [
  [/^T00/, 'Payment'],
  [/^T04/, 'Withdrawal to bank'],
  [/^T11(07)?/, 'Hold/Reserve/Dispute'],
  [/^T1107|^T1201/, 'Refund'],
];
export function renderPaypalReportCsv(txns: PaypalTxn[], window: { from: string; to: string }): string {
  const lines = [row(['Date', 'Event Code', 'Type', 'Status', 'Gross', 'Fee', 'Net', 'Transaction ID', 'Invoice ID'])];
  for (const t of txns) {
    const d = String(t.date).slice(0, 10);
    if (d < window.from || d > window.to) continue;
    const type = t.eventCode === 'T1107' || t.eventCode === 'T1201' ? 'Refund' : (PP_TYPE.find(([re]) => re.test(t.eventCode))?.[1] ?? 'Other');
    const net = (Number(t.amount) + Number(t.fee)).toFixed(2);
    lines.push(row([d, t.eventCode, type, t.status, t.amount, t.fee, net, t.transactionId, t.invoiceId ?? '']));
  }
  return lines.join('\n') + '\n';
}

/** Column-for-column the Affirm merchant-portal settlement report. */
export function renderAffirmReportCsv(events: AffirmEvent[], window: { from: string; to: string }): string {
  const lines = [row(['date', 'charge_created_date', 'charge_id', 'transaction_id', 'order_id', 'event_type', 'sales', 'refunds', 'fees', 'total_settled', 'txn_fees', 'deposit_id', 'merchant_ari', 'city', 'store', 'card_last_four', 'original_loan_amount', 'mdr_rate', 'channel'])];
  const portalType = (t: string) => (t === 'loan_capture' ? 'loan_captured' : t === 'loan_refund' ? 'loan_refunded' : t);
  for (const e of events) {
    if (e.date < window.from || e.date > window.to) continue;
    lines.push(row([
      e.date,
      e.chargeCreatedDate ?? '',
      e.purchaseId ?? '',
      e.transactionId ?? '',
      e.orderId ?? '',
      portalType(e.eventType),
      usd(e.salesCents),
      usd(e.refundsCents),
      usd(e.feesCents),
      usd(e.totalSettledCents),
      usd(e.transactionFeesCents),
      e.depositId,
      e.merchantAri ?? '',
      '', '', '',
      e.originalLoanAmountCents != null ? usd(e.originalLoanAmountCents) : '',
      e.mdr != null ? e.mdr.toFixed(6) : '',
      e.channel ?? '',
    ]));
  }
  return lines.join('\n') + '\n';
}

export async function buildReportCsv(provider: ReportProvider, from: string, to: string): Promise<string> {
  if (provider === 'shopify') {
    const [txns, payoutDates] = await Promise.all([fetchBalanceTransactions({ from, to }), fetchPayoutIssueDates({ from, to })]);
    return renderShopifyReportCsv(txns, payoutDates, { from, to });
  }
  if (provider === 'paypal') return renderPaypalReportCsv(await fetchPaypalTransactions({ from, to }), { from, to });
  return renderAffirmReportCsv(await fetchAffirmEvents({ after: from, before: to }), { from, to });
}

export function monthWindow(month: string): { from: string; to: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`bad month '${month}'`);
  const [y, m] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}
