import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithPermission, createServiceRoleClient } from '../../../../../platform/auth/guards';
import { fetchPayoutList } from '../../../../../lib/shopify/payoutFetch';

export const maxDuration = 60;

/**
 * Every Shopify Payments payout since 2026-01-01, straight from Shopify,
 * merged with the Hub's booking state where Loop E booked it. Pre-Hub
 * payouts (before the 2026-08-20 cutover) simply have no NS links —
 * expected and fine (owner 2026-09-07).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'shopify:view');

    const payouts = await fetchPayoutList('2026-01-01');

    const supabase = createServiceRoleClient();
    const { data: syncRows } = await supabase
      .from('shopify_payout_sync')
      .select('shopify_payout_id, state, ns_target, ns_fee_bill_id, ns_journal_id, error_message');
    const byId = new Map((syncRows ?? []).map((r) => [String(r.shopify_payout_id), r]));

    const prodAccount = process.env.NEXT_PUBLIC_NETSUITE_ACCOUNT_ID;
    const nsBase = (target: string | null) => {
      if (!prodAccount) return null;
      const account = target === 'sandbox' ? `${prodAccount}_SB1` : prodAccount;
      return `https://${account.toLowerCase().replace(/_/g, '-')}.app.netsuite.com`;
    };

    const rows = payouts.map((p) => {
      const sync = byId.get(String(p.legacyResourceId)) ?? null;
      const base = sync ? nsBase(sync.ns_target) : null;
      const s = p.summary;
      const fee =
        Number(s?.adjustmentsFee?.amount ?? 0) +
        Number(s?.chargesFee?.amount ?? 0) +
        Number(s?.refundsFee?.amount ?? 0) +
        Number(s?.reservedFundsFee?.amount ?? 0) +
        Number(s?.retriedPayoutsFee?.amount ?? 0);
      return {
        payout_id: String(p.legacyResourceId),
        issued_at: String(p.issuedAt).slice(0, 10),
        status: p.status,
        net_cents: Math.round(Number(p.net?.amount ?? 0) * 100),
        fee_cents: Math.round(fee * 100),
        state: sync?.state ?? null,
        error_message: sync?.error_message ?? null,
        links: {
          bill:
            base && sync?.ns_fee_bill_id
              ? `${base}/app/accounting/transactions/vendbill.nl?id=${sync.ns_fee_bill_id}`
              : null,
          journal:
            base && sync?.ns_journal_id
              ? `${base}/app/accounting/transactions/journal.nl?id=${sync.ns_journal_id}`
              : null,
        },
      };
    });

    return NextResponse.json({ payouts: rows });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
