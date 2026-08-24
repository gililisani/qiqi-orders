import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithPermission } from '../../../../platform/auth/guards';
import { fetchBalanceTransactions, fetchPayoutIssueDates, fetchGatewayTransactions } from '../../../../lib/shopify/statementFetch';
import { fetchPendingBalance } from '../../../../lib/shopify/payoutFetch';
import { buildStatementLines, buildGatewayStatementLines, renderOfx, renderOfxDocument, type OfxStatement } from '../../../../lib/shopify/core/statement';

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
    const KNOWN = ['shopify-payments', 'paypal', 'affirm'];
    const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

    // Requests: either repeated req=account:from:to (multi-account — the
    // plug-in path: ONE OFX document per pull, NetSuite concatenates
    // chunks) or legacy account/from/to params (dashboard download).
    const reqs: Array<{ account: string; from: string; to: string }> = [];
    for (const r of sp.getAll('req')) {
      const [account, from, to] = r.split(':');
      reqs.push({ account, from: from || today.slice(0, 8) + '01', to: to || today });
    }
    if (reqs.length === 0) {
      reqs.push({
        account: sp.get('account') ?? 'shopify-payments',
        from: sp.get('from') ?? today.slice(0, 8) + '01',
        to: sp.get('to') ?? today,
      });
    }
    // Coverage floors: the bookkeeper's manual CSV imports already put
    // statement lines into these accounts up to the dates below, and
    // NetSuite's Account Linking window cannot be edited after linking
    // (2026-08-24). Lines served before the floor would duplicate hers on
    // the left side (FITID dedupe never applies across sources), so the
    // Hub clamps instead. Irrelevant after each account's first pull —
    // NetSuite then requests from its own last import forward.
    const FLOOR: Record<string, string> = { paypal: '2026-05-29', affirm: '2026-08-01' };
    for (const r of reqs) {
      if (!KNOWN.includes(r.account)) return NextResponse.json({ error: `unknown account '${r.account}'` }, { status: 400 });
      if (!isDay(r.from) || !isDay(r.to) || r.from > r.to) {
        return NextResponse.json({ error: `bad window for '${r.account}': from/to must be YYYY-MM-DD with from <= to` }, { status: 400 });
      }
      const floor = FLOOR[r.account];
      if (floor && r.from < floor && !sp.get('ignoreFloor')) r.from = floor > r.to ? r.to : floor;
    }

    const statements: OfxStatement[] = [];
    for (const r of reqs) {
      if (r.account === 'shopify-payments') {
        const [txns, payoutDates] = await Promise.all([
          fetchBalanceTransactions({ from: r.from, to: r.to }),
          fetchPayoutIssueDates({ from: r.from, to: r.to }),
        ]);
        const pending = await fetchPendingBalance().catch(() => null);
        statements.push({
          acctId: r.account,
          lines: buildStatementLines(txns, { from: r.from, to: r.to, payoutDates }),
          from: r.from,
          to: r.to,
          ledgerBalanceCents: pending != null ? Math.round(pending * 100) : 0,
        });
      } else {
        statements.push({
          acctId: r.account,
          lines: buildGatewayStatementLines(await fetchGatewayTransactions(r.account as 'paypal' | 'affirm', { from: r.from, to: r.to }), { from: r.from, to: r.to }),
          from: r.from,
          to: r.to,
        });
      }
    }
    const total = statements.reduce((n, st) => n + st.lines.length, 0);
    if (sp.get('format') === 'json') {
      return NextResponse.json({ statements: statements.map((st) => ({ account: st.acctId, from: st.from, to: st.to, count: st.lines.length, lines: st.lines })) });
    }
    const ofx = renderOfxDocument(statements);
    const label = statements.length === 1 ? statements[0].acctId : 'multi';
    return new NextResponse(ofx, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ofx; charset=utf-8',
        'Content-Disposition': `attachment; filename="shopify-${label}-${statements[0].from}_${statements[0].to}.ofx"`,
        'X-Statement-Lines': String(total),
      },
    });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
