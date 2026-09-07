import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { fetchPaypalTransactions } from '../../../../../lib/shopify/gateways/paypal';
import { planPaypal } from '../../../../../lib/settlements/plan';

export const maxDuration = 60;

/**
 * PayPal withdrawals to the bank since 2026-01-01, live from the PayPal
 * Transaction Search API (the settlement mechanism's plan layer). No NS
 * links: these journals were booked manually until settlement automation
 * is approved; the Hub-created links appear once execution ships.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'shopify:view');
    const today = new Date().toISOString().slice(0, 10);
    const txs = await fetchPaypalTransactions({ from: '2026-01-01', to: today });
    const plan = planPaypal(txs);
    const withdrawals = plan.withdrawalJournals
      .map((w) => ({
        transaction_id: w.reference,
        date: w.date,
        amount_cents: Math.round(w.amount * 100),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
    return NextResponse.json({ withdrawals });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
