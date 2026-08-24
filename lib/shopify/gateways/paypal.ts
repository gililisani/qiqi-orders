/**
 * PayPal Transaction Search client (Phase B). Live REST creds in env
 * (PAYPAL_CLIENT_ID/SECRET, Transaction Search enabled on the app).
 * Read-only; amounts stay as decimal strings until the transform.
 */
import axios from 'axios';

export interface PaypalTxn {
  transactionId: string;
  eventCode: string; // T0006 sale, T04xx withdrawal, T11xx dispute/hold, ...
  date: string; // ISO
  status: string;
  amount: string;
  fee: string;
  invoiceId: string | null;
}

const BASE = 'https://api-m.paypal.com';

export async function paypalToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID, sec = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !sec) throw new Error('PAYPAL_CLIENT_ID/SECRET not configured');
  const r = await axios.post(`${BASE}/v1/oauth2/token`, 'grant_type=client_credentials', { auth: { username: id, password: sec } });
  return r.data.access_token;
}

/** Fetch transactions for [from, to] (ISO days, inclusive) — chunked into PayPal's 31-day window limit. */
export async function fetchPaypalTransactions(opts: { from: string; to: string }): Promise<PaypalTxn[]> {
  const token = await paypalToken();
  const out: PaypalTxn[] = [];
  let cursor = new Date(opts.from + 'T00:00:00Z');
  const end = new Date(opts.to + 'T23:59:59Z');
  while (cursor <= end) {
    const chunkEnd = new Date(Math.min(cursor.getTime() + 30 * 864e5, end.getTime()));
    for (let page = 1; page < 20; page++) {
      const r = await axios.get(`${BASE}/v1/reporting/transactions`, {
        params: {
          start_date: cursor.toISOString().slice(0, 19) + '-0000',
          end_date: chunkEnd.toISOString().slice(0, 19) + '-0000',
          fields: 'transaction_info',
          page_size: 500,
          page,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      for (const t of r.data.transaction_details ?? []) {
        const i = t.transaction_info;
        out.push({
          transactionId: i.transaction_id,
          eventCode: i.transaction_event_code,
          date: i.transaction_initiation_date,
          status: i.transaction_status,
          amount: i.transaction_amount?.value ?? '0',
          fee: i.fee_amount?.value ?? '0',
          invoiceId: i.invoice_id ?? null,
        });
      }
      if (page >= (r.data.total_pages ?? 1)) break;
    }
    cursor = new Date(chunkEnd.getTime() + 1000);
  }
  return out;
}
