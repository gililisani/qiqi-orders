import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { fetchAffirmEvents } from '../../../../../lib/shopify/gateways/affirm';

export const maxDuration = 60;

/**
 * Affirm remittances for the Payouts tab: settlement events of the last
 * 90 days grouped by deposit_id — each row is one "MBS Affirm FBO" bank
 * deposit (net of Affirm's fees). Live from the Affirm API; failures
 * degrade inside the tab, never the dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const events = await fetchAffirmEvents({ after: from, before: to });
    const byDeposit = new Map<string, { date: string; sales: number; refunds: number; fees: number; net: number; events: number }>();
    for (const e of events) {
      const d = byDeposit.get(e.depositId) ?? { date: e.date, sales: 0, refunds: 0, fees: 0, net: 0, events: 0 };
      d.date = d.date < e.date ? e.date : d.date;
      d.sales += e.salesCents;
      d.refunds += e.refundsCents;
      d.fees += e.feesCents;
      d.net += e.totalSettledCents;
      d.events += 1;
      byDeposit.set(e.depositId, d);
    }
    const remittances = [...byDeposit.entries()]
      .map(([depositId, d]) => ({ deposit_id: depositId, issued_at: d.date, sales_cents: d.sales, refunds_cents: d.refunds, fee_cents: d.fees, net_cents: d.net, events: d.events }))
      .sort((a, b) => b.issued_at.localeCompare(a.issued_at));
    return NextResponse.json({ remittances, window: { from, to } });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
