import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../../platform/auth/guards';
import { buildCompanyPerformance } from '../../../../../lib/companyPerformance';

/**
 * GET /api/reports/company-performance/[companyId]
 *   ?window=this-month|last-month|this-year|last-year|custom
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD   (custom only)
 *
 * Single-company performance dashboard payload. All revenue is Done-based
 * (+ historical_sales) — same definition as the report and target periods.
 */

function windowRange(window: string, fromParam: string | null, toParam: string | null) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  if (window === 'last-month') {
    return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)) };
  }
  if (window === 'this-year') {
    return { from: new Date(Date.UTC(y, 0, 1)), to: now };
  }
  if (window === 'last-year') {
    return { from: new Date(Date.UTC(y - 1, 0, 1)), to: new Date(Date.UTC(y - 1, 11, 31, 23, 59, 59, 999)) };
  }
  if (window === 'custom') {
    if (!fromParam || !toParam || !/^\d{4}-\d{2}-\d{2}$/.test(fromParam) || !/^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
      throw new Error('custom window requires valid from and to dates');
    }
    return { from: new Date(`${fromParam}T00:00:00.000Z`), to: new Date(`${toParam}T23:59:59.999Z`) };
  }
  // default: this-month
  return { from: new Date(Date.UTC(y, m, 1)), to: now };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { companyId: string } }
) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const window = searchParams.get('window') ?? 'this-month';
    const { from, to } = windowRange(window, searchParams.get('from'), searchParams.get('to'));

    const supabase = createServiceRoleClient();
    const data = await buildCompanyPerformance(supabase, params.companyId, from, to);
    return NextResponse.json({ success: true, windowKey: window, ...data });
  } catch (err: any) {
    const msg = err?.message ?? 'Unknown error';
    const status = msg === 'Not authenticated' || msg === 'Forbidden' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
