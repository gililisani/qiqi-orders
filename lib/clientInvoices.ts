/**
 * Client-facing invoice math — single source for the dashboard's outstanding
 * badge and the Billing page (Phase A of the billing center: everything here
 * reads the NetSuite-synced fields already cached on orders; actual invoice
 * PDFs are the planned Phase B RESTlet work).
 */

export interface InvoiceOrderFields {
  invoice_number?: string | null;
  invoice_amount_remaining?: number | null;
  invoice_due_date?: string | null;
  netsuite_invoice_status?: string | null;
  netsuite_invoice_date?: string | null;
  payment_status?: string | null;
  paid_at?: string | null;
  stripe_hosted_url?: string | null;
}

export type InvoiceState = 'paid' | 'open' | 'overdue' | 'unknown';

export interface InvoiceInfo {
  /** Best-known open balance: cached amount_remaining, else 0 when NetSuite
   *  says Paid In Full, else null (genuinely unknown — never inflate). */
  remaining: number | null;
  state: InvoiceState;
  overdue: boolean;
}

export function invoiceInfo(o: InvoiceOrderFields, nowMs: number = Date.now()): InvoiceInfo {
  let remaining: number | null = null;
  const cached = Number(o.invoice_amount_remaining);
  if (Number.isFinite(cached)) {
    remaining = cached;
  } else if ((o.netsuite_invoice_status || '').toLowerCase().includes('paid in full')) {
    remaining = 0;
  } else if (o.payment_status === 'paid') {
    remaining = 0;
  }

  let overdue = false;
  if (remaining != null && remaining > 0.005 && o.invoice_due_date) {
    const dueMs = new Date(`${o.invoice_due_date}T23:59:59Z`).getTime();
    overdue = !Number.isNaN(dueMs) && dueMs < nowMs;
  }

  const state: InvoiceState =
    remaining == null
      ? 'unknown'
      : remaining <= 0.005
        ? 'paid'
        : overdue
          ? 'overdue'
          : 'open';

  return { remaining, state, overdue };
}
