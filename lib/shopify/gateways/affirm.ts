/**
 * Affirm settlement-events client (Phase B). Basic auth with the
 * production API key pair + AFFIRM_MERCHANT_ID (the merchant_ari from
 * the settlement reports). Amounts are CENTS in the API.
 *
 * api.affirm.com intermittently serves an S3-style "Unsupported
 * Authorization Type" error page (edge/WAF flake, seen 2026-08-24) —
 * surfaced as a retryable error.
 */
import axios from 'axios';

export interface AffirmEvent {
  id: string;
  date: string; // disbursed date (deposit initiated)
  eventType: string; // loan_capture | loan_refund | fee_adjustment | ...
  salesCents: number;
  refundsCents: number;
  feesCents: number; // negative; includes txn fees
  totalSettledCents: number;
  depositId: string;
  transactionId: string | null;
  orderId: string | null;
  // Portal-report fields (the bookkeeper's settlement CSV mirrors these):
  purchaseId: string | null;
  chargeCreatedDate: string | null;
  transactionFeesCents: number;
  originalLoanAmountCents: number | null;
  mdr: number | null;
  channel: string | null;
  merchantAri: string | null;
  currency: string | null;
}

export async function fetchAffirmEvents(opts: { after: string; before: string }): Promise<AffirmEvent[]> {
  const pub = process.env.AFFIRM_PUBLIC_API_KEY, priv = process.env.AFFIRM_PRIVATE_API_KEY, mid = process.env.AFFIRM_MERCHANT_ID;
  if (!pub || !priv || !mid) throw new Error('AFFIRM_PUBLIC_API_KEY/AFFIRM_PRIVATE_API_KEY/AFFIRM_MERCHANT_ID not configured');
  const out: AffirmEvent[] = [];
  let params: Record<string, string | number> = { merchant_id: mid, after: opts.after, before: opts.before, limit: 1000 };
  for (let page = 0; page < 20; page++) {
    const r = await axios.get('https://api.affirm.com/api/v1/settlements/events', {
      params,
      auth: { username: pub, password: priv },
      headers: { Accept: 'application/json' },
      validateStatus: () => true,
    });
    if (r.status !== 200) {
      const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      const flake = body.includes('Unsupported Authorization Type');
      throw new Error(`Affirm settlements HTTP ${r.status}${flake ? ' (edge flake — retry later)' : `: ${body.replace(/Basic [A-Za-z0-9+/=]+/g, '<redacted>').slice(0, 200)}`}`);
    }
    for (const e of r.data.data ?? []) {
      out.push({
        id: e.id,
        date: e.date,
        eventType: e.event_type,
        salesCents: e.sales ?? 0,
        refundsCents: e.refunds ?? 0,
        feesCents: e.fees ?? 0,
        totalSettledCents: e.total_settled ?? 0,
        depositId: e.deposit_id,
        transactionId: e.transaction_id ?? null,
        orderId: e.order_id ?? null,
        purchaseId: e.purchase_id ?? null,
        chargeCreatedDate: e.charge_created_date ?? null,
        transactionFeesCents: e.transaction_fees ?? 0,
        originalLoanAmountCents: e.original_loan_amount ?? null,
        mdr: e.mdr ?? null,
        channel: e.channel ?? null,
        merchantAri: e.initiating_merchant_id ?? e.merchant_id ?? null,
        currency: e.currency ?? null,
      });
    }
    const next = r.data.next_page;
    if (!next || (r.data.data ?? []).length === 0) break;
    const q = new URLSearchParams(String(next).replace(/^\?/, ''));
    params = { merchant_id: mid, limit: 1000 };
    for (const [k, v] of q.entries()) params[k] = v;
  }
  return out;
}
