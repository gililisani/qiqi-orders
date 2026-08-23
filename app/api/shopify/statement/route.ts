import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithPermission } from '../../../../platform/auth/guards';
import { fetchBalanceTransactions, fetchPayoutIssueDates } from '../../../../lib/shopify/statementFetch';
import { fetchPendingBalance } from '../../../../lib/shopify/payoutFetch';
import { buildStatementLines, renderOfx } from '../../../../lib/shopify/core/statement';

export const maxDuration = 120;

/**
 * 100501 statement for NetSuite Banking Import (Part 1 reconciliation).
 *   GET /api/shopify/statement?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=ofx|json]
 * Auth: admin with the netsuite permission (dashboard download) OR the
 * connectivity plug-in's bearer token (SHOPIFY_STATEMENT_TOKEN).
 */
export async function GET(request: NextRequest) {
  try {
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const token = process.env.SHOPIFY_STATEMENT_TOKEN;
    if (!(token && bearer && bearer === token)) await requireAdminWithPermission(request, 'netsuite');
    if (!process.env.SHOPIFY_CLIENT_ID && !process.env.SHOPIFY_ADMIN_TOKEN) {
      return NextResponse.json({ error: 'Shopify credentials are not configured in this environment' }, { status: 503 });
    }
    const sp = request.nextUrl.searchParams;
    const today = new Date().toISOString().slice(0, 10);
    const from = sp.get('from') ?? today.slice(0, 8) + '01';
    const to = sp.get('to') ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return NextResponse.json({ error: 'from/to must be YYYY-MM-DD with from <= to' }, { status: 400 });
    }
    const [txns, payoutDates] = await Promise.all([fetchBalanceTransactions({ from, to }), fetchPayoutIssueDates({ from, to })]);
    const lines = buildStatementLines(txns, { from, to, payoutDates });
    if (sp.get('format') === 'json') {
      return NextResponse.json({ from, to, count: lines.length, totalCents: lines.reduce((s, l) => s + l.cents, 0), lines });
    }
    const pending = await fetchPendingBalance().catch(() => null);
    const ofx = renderOfx(lines, { from, to, ledgerBalanceCents: pending != null ? Math.round(pending * 100) : 0 });
    return new NextResponse(ofx, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ofx; charset=utf-8',
        'Content-Disposition': `attachment; filename="shopify-100501-${from}_${to}.ofx"`,
        'X-Statement-Lines': String(lines.length),
      },
    });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
