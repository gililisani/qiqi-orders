import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { buildCompanyPerformance, resolveWindowRange } from '../../../../../lib/companyPerformance';

/**
 * GET /api/reports/company-performance/[companyId]
 *   ?window=this-month|last-month|this-year|last-year|custom
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD   (custom only)
 *
 * Single-company performance dashboard payload. All revenue is Done-based
 * (+ historical_sales) — same definition as the report and target periods.
 * The client-facing twin lives at /api/client/performance (same builder,
 * company locked to the caller's own).
 */

export async function GET(request: NextRequest, props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  try {
    await requireAdminWithPermission(request, 'reports');
    const { searchParams } = new URL(request.url);
    const window = searchParams.get('window') ?? 'this-month';
    const { from, to } = resolveWindowRange(window, searchParams.get('from'), searchParams.get('to'));

    const supabase = createServiceRoleClient();
    const data = await buildCompanyPerformance(supabase, params.companyId, from, to);
    return NextResponse.json({ success: true, windowKey: window, ...data });
  } catch (err: any) {
    if (err instanceof Response) return err;
    const msg = err?.message ?? 'Unknown error';
    const status = msg === 'Not authenticated' || msg === 'Forbidden' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
