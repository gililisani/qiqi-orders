import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdmin,
} from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';

/**
 * POST /api/netsuite/refresh-all-invoices
 * Body: { onlyMissing?: boolean }  (default: false — refresh everything)
 *
 * Backfill / refresh tool for the cached NetSuite invoice columns
 * (invoice_amount_remaining, invoice_due_date, netsuite_invoice_status,
 * netsuite_invoice_date, invoice_number). Loops every Hub order that
 * has a netsuite_invoice_id, calls getInvoiceDetails for each, and
 * writes the result back to the orders row.
 *
 * Designed for one-off use:
 *   - After the migration that added the new invoice columns, to fill
 *     them for historical orders without clicking Sync Invoice per order
 *   - Periodically to refresh AR data without setting up a cron
 *
 * Concurrency is capped at 5 in-flight to avoid hammering NetSuite,
 * which keeps the operation under ~30s for ~100 invoices on typical
 * accounts. Each call's failure is captured per-order so a couple
 * bad rows don't kill the whole job.
 */

const CONCURRENCY = 5;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json().catch(() => ({}));
    const onlyMissing = body?.onlyMissing === true;

    const supabase = createServiceRoleClient();

    let query = supabase
      .from('orders')
      .select('id, netsuite_invoice_id, po_number')
      .not('netsuite_invoice_id', 'is', null);

    if (onlyMissing) {
      // Only orders where we don't yet have the new columns populated.
      query = query.is('invoice_amount_remaining', null);
    }

    const { data: orders, error: ordersErr } = await query;
    if (ordersErr) throw ordersErr;

    if (!orders || orders.length === 0) {
      return NextResponse.json({
        success: true,
        total: 0,
        refreshed: 0,
        failed: 0,
        durationMs: 0,
        failures: [],
        message: onlyMissing
          ? 'No invoiced orders are missing the new fields.'
          : 'No invoiced orders found.',
      });
    }

    const ns = createNetSuiteAPI();
    const startedAt = Date.now();
    let refreshed = 0;
    const failures: Array<{ orderId: string; poNumber: string | null; error: string }> = [];

    // Simple concurrency-limited fan-out: process in chunks of CONCURRENCY.
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

    const durationMs = Date.now() - startedAt;

    return NextResponse.json({
      success: true,
      total: orders.length,
      refreshed,
      failed: failures.length,
      durationMs,
      failures: failures.slice(0, 10), // cap to keep response small
      truncated: failures.length > 10,
      message: `Refreshed ${refreshed} of ${orders.length} invoices in ${(durationMs / 1000).toFixed(1)}s.`,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[refresh-all-invoices] error:', err);
    return NextResponse.json(
      { error: err?.message || 'Refresh failed' },
      { status: 500 },
    );
  }
}
