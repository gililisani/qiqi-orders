import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { storeDate } from '../../../../../lib/shopify/core/dates';
import { fetchUpcomingPayout } from '../../../../../lib/shopify/payoutFetch';

/**
 * Dashboard payload for /admin/shopify: the FINANCIAL view (owner
 * directive 2026-08-20 — what accounting wants: order counts/value, fees,
 * next payout) + config + recent orders (with NS deep links) + errors +
 * payouts. Periods are computed on the STORE's calendar (America/New_York).
 */

/** Booked = counted in the financial cards. */
const BOOKED_STATES = new Set(['so_created', 'invoiced', 'paid', 'fulfilled', 'refunded', 'closed']);

interface PeriodSums {
  orders: number;
  valueCents: number;
  refundedCents: number;
  feesCents: number;
}

function emptySums(): PeriodSums {
  return { orders: 0, valueCents: 0, refundedCents: 0, feesCents: 0 };
}

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

    const financialSince = new Date(Date.now() - 35 * 864e5).toISOString();
    const [{ data: config }, { data: orders }, { data: payouts }, { data: events }, { data: finRows }] = await Promise.all([
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
      db
        .from('shopify_order_sync')
        .select('order_created_at, state, total_cents, refunded_cents, plan')
        .gte('order_created_at', financialSince),
    ]);

    // ---- financial periods, on the store's (ET) calendar ----
    const now = new Date();
    const todayEt = storeDate(now.toISOString());
    const weekStartEt = storeDate(new Date(now.getTime() - 6 * 864e5).toISOString());
    const monthEt = todayEt.slice(0, 7); // YYYY-MM
    const periods = { today: emptySums(), last7: emptySums(), mtd: emptySums() };
    for (const r of finRows ?? []) {
      if (!BOOKED_STATES.has(r.state)) continue;
      const etDate = storeDate(r.order_created_at);
      const fees = ((r.plan as any)?.payments ?? []).reduce(
        (s: number, p: any) => s + (typeof p.feeCents === 'number' ? p.feeCents : 0),
        0,
      );
      for (const [key, inPeriod] of [
        ['today', etDate === todayEt],
        ['last7', etDate >= weekStartEt],
        ['mtd', etDate.startsWith(monthEt)],
      ] as const) {
        if (!inPeriod) continue;
        const sums = periods[key];
        sums.orders += 1;
        sums.valueCents += r.total_cents ?? 0;
        sums.refundedCents += r.refunded_cents ?? 0;
        sums.feesCents += fees;
      }
    }

    // Next payout straight from Shopify — absent (null) when Shopify isn't
    // configured (staging) or the call fails; the card shows a dash.
    let nextPayout = null;
    if (process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_ADMIN_TOKEN) {
      try {
        nextPayout = await fetchUpcomingPayout();
      } catch {
        nextPayout = null;
      }
    }

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
      financials: { periods, nextPayout },
      orders: rows,
      payouts: payoutRows,
      events,
    });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
