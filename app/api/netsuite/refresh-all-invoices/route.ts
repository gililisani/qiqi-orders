import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdminWithPermission,
} from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';
import { refreshInvoices } from '../../../../lib/invoiceRefresh';

/**
 * POST /api/netsuite/refresh-all-invoices
 * Body: { onlyMissing?: boolean }  (default: false — refresh everything)
 *
 * Backfill / refresh tool for the cached NetSuite invoice columns. The core
 * loop lives in lib/invoiceRefresh.ts, shared with the nightly cron
 * (/api/cron/refresh-invoices) — this admin button remains for immediate
 * refreshes and full backfills including settled invoices.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'orders:edit');

    const body = await request.json().catch(() => ({}));
    const onlyMissing = body?.onlyMissing === true;

    const supabase = createServiceRoleClient();
    const ns = createNetSuiteAPI();

    const result = await refreshInvoices(supabase, ns, { onlyMissing });

    if (result.total === 0) {
      return NextResponse.json({
        success: true,
        ...result,
        failures: [],
        message: onlyMissing
          ? 'No invoiced orders are missing the new fields.'
          : 'No invoiced orders found.',
      });
    }

    return NextResponse.json({
      success: true,
      ...result,
      failures: result.failures.slice(0, 10), // cap to keep response small
      truncated: result.failures.length > 10,
      message: `Refreshed ${result.refreshed} of ${result.total} invoices in ${(result.durationMs / 1000).toFixed(1)}s.`,
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
