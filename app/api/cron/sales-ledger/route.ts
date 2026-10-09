import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';
import { syncSalesLedger } from '../../../../lib/salesLedger/sync';
import { runReviewAlerts } from '../../../../lib/salesLedger/alerts';

// Route-level export: vercel.json maxDuration is not honored for Next routes.
export const maxDuration = 300;

/**
 * Nightly (vercel.json): mirror every linked customer's NetSuite billing
 * documents for the NetSuite review page (read-only towards NetSuite), then
 * email what's new to review (lib/salesLedger/alerts — once per item).
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
    const summary = await syncSalesLedger(createServiceRoleClient(), createNetSuiteAPI());
    if (summary.errors.length) console.error('[cron/sales-ledger] errors:', JSON.stringify(summary.errors.slice(0, 10)));
    console.log(
      `[cron/sales-ledger] ${summary.skipped ?? `${summary.companies} companies, ${summary.documents} documents, ${summary.removed} removed`} in ${summary.durationMs}ms`
    );
    let alerts: unknown = null;
    if (!summary.skipped) {
      try {
        alerts = await runReviewAlerts(createServiceRoleClient());
        console.log('[cron/sales-ledger] alerts:', JSON.stringify(alerts));
      } catch (err: any) {
        alerts = { error: err?.message ?? String(err) };
        console.error('[cron/sales-ledger] alerts failed:', err);
      }
    }
    return NextResponse.json({ success: true, ...summary, alerts });
  } catch (err: any) {
    console.error('[cron/sales-ledger] error:', err);
    return NextResponse.json({ error: err?.message || 'Sync failed' }, { status: 500 });
  }
}
