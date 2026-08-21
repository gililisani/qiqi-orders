import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';

/**
 * Dashboard payload for /admin/shopify: the FINANCIAL view (owner
 * directive 2026-08-21 — the bookkeeper's snapshot of the STORE, straight
 * from Shopify: orders/value, processing fees, per-gateway split, next
 * payout) + config + recent orders (with NS deep links) + errors +
 * payouts. The financials come from the poll cron's cached snapshot
 * (shopify_sync_config.financial_snapshot) — this route never waits on
 * Shopify.
 */

function nsBase(target: string | null): string | null {
  const prodAccount = process.env.NEXT_PUBLIC_NETSUITE_ACCOUNT_ID;
  if (!prodAccount) return null;
  const account = target === 'sandbox' ? `${prodAccount}_SB1` : prodAccount;
  return `https://${account.toLowerCase().replace(/_/g, '-')}.app.netsuite.com`;
}

const NS_PATHS = {
  customer: (id: string) => `/app/common/entity/custjob.nl?id=${id}`,
  so: (id: string) => `/app/accounting/transactions/salesord.nl?id=${id}`,
  invoice: (id: string) => `/app/accounting/transactions/custinvc.nl?id=${id}`,
  payment: (id: string) => `/app/accounting/transactions/custpymt.nl?id=${id}`,
  fulfillment: (id: string) => `/app/accounting/transactions/itemship.nl?id=${id}`,
  creditMemo: (id: string) => `/app/accounting/transactions/custcred.nl?id=${id}`,
  bill: (id: string) => `/app/accounting/transactions/vendbill.nl?id=${id}`,
  journal: (id: string) => `/app/accounting/transactions/journal.nl?id=${id}`,
};

export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const db = createServiceRoleClient();

    const [{ data: config }, { data: orders }, { data: payouts }, { data: events }] = await Promise.all([
      db.from('shopify_sync_config').select('*').eq('id', 1).single(),
      db
        .from('shopify_order_sync')
        .select(
          'shopify_order_id, order_name, order_created_at, buyer_kind, state, skip_reason, total_cents, refunded_cents, ns_target, ns_customer_id, ns_so_id, ns_invoice_id, ns_payment_ids, ns_fulfillment_ids, ns_credit_memo_ids, error_code, error_message, error_detail, ignore_note, updated_at',
        )
        .order('order_created_at', { ascending: false })
        .limit(100),
      db
        .from('shopify_payout_sync')
        .select('*')
        .order('issued_at', { ascending: false })
        .limit(20),
      db
        .from('shopify_sync_events')
        .select('loop, event, shopify_order_id, detail, created_at')
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    const counts: Record<string, number> = {};
    for (const o of orders ?? []) counts[o.state] = (counts[o.state] ?? 0) + 1;

    const rows = (orders ?? []).map((o) => {
      const base = nsBase(o.ns_target);
      const link = (path: string | null) => (base && path ? `${base}${path}` : null);
      return {
        ...o,
        links: {
          customer: o.ns_customer_id ? link(NS_PATHS.customer(o.ns_customer_id)) : null,
          so: o.ns_so_id ? link(NS_PATHS.so(o.ns_so_id)) : null,
          invoice: o.ns_invoice_id ? link(NS_PATHS.invoice(o.ns_invoice_id)) : null,
          fulfillments: (o.ns_fulfillment_ids ?? []).map((id: string) => link(NS_PATHS.fulfillment(id))),
          creditMemos: (o.ns_credit_memo_ids ?? []).map((id: string) => link(NS_PATHS.creditMemo(id))),
        },
      };
    });

    const payoutRows = (payouts ?? []).map((p) => {
      const base = nsBase(p.ns_target);
      const link = (path: string | null) => (base && path ? `${base}${path}` : null);
      return {
        ...p,
        links: {
          bill: p.ns_fee_bill_id ? link(NS_PATHS.bill(p.ns_fee_bill_id)) : null,
          journal: p.ns_journal_id ? link(NS_PATHS.journal(p.ns_journal_id)) : null,
        },
      };
    });

    return NextResponse.json({
      config,
      counts,
      errorCount: counts['error'] ?? 0,
      financials: (config as any)?.financial_snapshot ?? null,
      orders: rows,
      payouts: payoutRows,
      events,
    });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
