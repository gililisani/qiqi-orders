import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithPermission } from '../../../../platform/auth/guards';
import { buildReportCsv, REPORT_PROVIDERS, type ReportProvider } from '../../../../lib/shopify/reports';

export const maxDuration = 120;

/** Live finance report for a date range: GET ?provider=shopify|paypal|affirm&from&to → CSV download. */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const sp = request.nextUrl.searchParams;
    const provider = sp.get('provider') as ReportProvider;
    const from = sp.get('from') ?? '';
    const to = sp.get('to') ?? '';
    if (!REPORT_PROVIDERS.includes(provider)) return NextResponse.json({ error: `provider must be one of ${REPORT_PROVIDERS.join('|')}` }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return NextResponse.json({ error: 'from/to must be YYYY-MM-DD with from <= to' }, { status: 400 });
    }
    const csv = await buildReportCsv(provider, from, to);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${provider}-${from}_${to}.csv"`,
      },
    });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
