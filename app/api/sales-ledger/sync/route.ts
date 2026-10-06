import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';
import { syncSalesLedger } from '../../../../lib/salesLedger/sync';

// Route-level export: vercel.json maxDuration is not honored for Next routes.
export const maxDuration = 300;

/**
 * "Sync now" for the sales ledger — one company ({ companyId }) or all.
 * Reads NetSuite (SuiteQL only); writes the Hub's ledger tables.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'distributors:edit');
    const body = await request.json().catch(() => ({}));
    const companyId = body?.companyId ? String(body.companyId) : null;
    if (!process.env.NETSUITE_ACCOUNT_ID) {
      return NextResponse.json({ error: 'NetSuite is not configured in this environment.' }, { status: 503 });
    }
    const summary = await syncSalesLedger(createServiceRoleClient(), createNetSuiteAPI(), {
      companyIds: companyId ? [companyId] : undefined,
    });
    if (summary.skipped) return NextResponse.json({ error: summary.skipped, summary }, { status: 409 });
    return NextResponse.json({ summary });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[sales-ledger/sync] error:', err);
    return NextResponse.json({ error: err?.message || 'Sync failed.' }, { status: 500 });
  }
}
