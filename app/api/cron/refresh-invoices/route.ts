import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';
import { refreshInvoices } from '../../../../lib/invoiceRefresh';

/**
 * Nightly (02:30 UTC, vercel.json): refresh the cached NetSuite invoice
 * fields so partner billing pages stay current without an admin clicking
 * "Refresh all invoices". Settled invoices (Paid In Full, zero balance) are
 * skipped — they can't change, so the job only touches open AR, typically a
 * handful of rows.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    if (!process.env.NETSUITE_ACCOUNT_ID) {
      // Staging has no NetSuite on purpose — succeed quietly.
      return NextResponse.json({ success: true, skipped: 'NetSuite not configured' });
    }

    const supabase = createServiceRoleClient();
    const ns = createNetSuiteAPI();
    const result = await refreshInvoices(supabase, ns, { skipSettled: true });

    if (result.failed > 0) {
      console.error('[cron/refresh-invoices] failures:', JSON.stringify(result.failures.slice(0, 10)));
    }
    console.log(
      `[cron/refresh-invoices] refreshed ${result.refreshed}/${result.total} open invoices in ${result.durationMs}ms`,
    );
    return NextResponse.json({ success: true, ...result, failures: result.failures.slice(0, 10) });
  } catch (err: any) {
    console.error('[cron/refresh-invoices] error:', err);
    return NextResponse.json({ error: err?.message || 'Refresh failed' }, { status: 500 });
  }
}
