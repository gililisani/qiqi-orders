import type { SupabaseClient } from '@supabase/supabase-js';
import type { NetSuiteAPI } from './netsuite';

/**
 * Shared core for refreshing the cached NetSuite invoice columns on orders
 * (invoice_number, netsuite_invoice_date, netsuite_invoice_status,
 * invoice_amount_remaining, invoice_due_date).
 *
 * Used by the admin "Refresh all invoices" button (everything, or only rows
 * missing fields) and the nightly cron (only invoices that can still change —
 * settled ones are skipped so the job stays tiny).
 */

const CONCURRENCY = 5;

export interface RefreshResult {
  total: number;
  refreshed: number;
  failed: number;
  durationMs: number;
  failures: Array<{ orderId: string; poNumber: string | null; error: string }>;
}

interface RefreshableOrder {
  id: string;
  netsuite_invoice_id: string;
  po_number: string | null;
  netsuite_invoice_status: string | null;
  invoice_amount_remaining: number | null;
}

/** An invoice that is fully settled can't change — skip it in nightly runs. */
export function isSettled(o: {
  netsuite_invoice_status: string | null;
  invoice_amount_remaining: number | null;
}): boolean {
  // Tolerant match, never strict-equal (status text varies by account).
  const paid = (o.netsuite_invoice_status || '').toLowerCase().includes('paid in full');
  return paid && Number(o.invoice_amount_remaining) === 0;
}

export async function refreshInvoices(
  supabase: SupabaseClient,
  ns: NetSuiteAPI,
  opts: { onlyMissing?: boolean; skipSettled?: boolean } = {},
): Promise<RefreshResult> {
  let query = supabase
    .from('orders')
    .select('id, netsuite_invoice_id, po_number, netsuite_invoice_status, invoice_amount_remaining')
    .not('netsuite_invoice_id', 'is', null);

  if (opts.onlyMissing) {
    query = query.is('invoice_amount_remaining', null);
  }

  const { data, error } = await query;
  if (error) throw error;

  let orders = (data as RefreshableOrder[]) || [];
  if (opts.skipSettled) {
    orders = orders.filter((o) => !isSettled(o));
  }

  const startedAt = Date.now();
  let refreshed = 0;
  const failures: RefreshResult['failures'] = [];

  for (let i = 0; i < orders.length; i += CONCURRENCY) {
    const chunk = orders.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (o) => {
        try {
          const inv = await ns.getInvoiceDetails(o.netsuite_invoice_id);
          const { error: updateErr } = await supabase
            .from('orders')
            .update({
              invoice_number: inv.invoiceNumber,
              netsuite_invoice_date: inv.invoiceDate || null,
              netsuite_invoice_status: inv.status || null,
              invoice_amount_remaining: inv.amountRemaining,
              invoice_due_date: inv.dueDate,
            })
            .eq('id', o.id);
          if (updateErr) throw updateErr;
          refreshed += 1;
        } catch (err: any) {
          failures.push({
            orderId: o.id,
            poNumber: o.po_number ?? null,
            error: err?.message ?? 'Unknown error',
          });
        }
      }),
    );
  }

  return {
    total: orders.length,
    refreshed,
    failed: failures.length,
    durationMs: Date.now() - startedAt,
    failures,
  };
}
