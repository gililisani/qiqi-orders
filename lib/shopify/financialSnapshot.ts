/**
 * Store-wide financial snapshot for the dashboard (owner directive
 * 2026-08-21): the bookkeeper's view of the STORE, straight from Shopify —
 * every order in the period regardless of which system booked it
 * (NetScore-era included), so the numbers match Shopify's own reports.
 *
 * Computed by the 15-min poll cron and cached in shopify_sync_config
 * (financial_snapshot jsonb) — the dashboard reads the cache instantly
 * and never waits on Shopify.
 *
 * Periods run on the store's calendar (America/New_York).
 */
import { shopifyPaginate } from './client';
import { storeDate } from './core/dates';
import { fetchPendingBalance, fetchUpcomingPayout, type UpcomingPayout } from './payoutFetch';

export interface StorePeriodSums {
  orders: number;
  valueCents: number;
  refundedCents: number;
  /** Shopify Payments processing fees on successful charges. */
  feesCents: number;
  /** Captured money per gateway (maps 1:1 to the clearing accounts). */
  gatewaysCents: Record<string, number>;
}

export interface FinancialSnapshot {
  computedAt: string;
  periods: { today: StorePeriodSums; last7: StorePeriodSums; mtd: StorePeriodSums };
  nextPayout: UpcomingPayout | null;
}

interface LightOrder {
  name: string;
  test: boolean;
  createdAt: string;
  currentTotalPriceSet: { shopMoney: { amount: string } };
  totalRefundedSet: { shopMoney: { amount: string } };
  transactions: Array<{
    kind: string;
    status: string;
    gateway: string;
    amountSet: { shopMoney: { amount: string } };
    fees?: Array<{ amount: { amount: string } }>;
  }>;
}

const LIGHT_QUERY = `query Fin($q: String!, $cursor: String) {
  orders(first: 100, after: $cursor, query: $q) {
    nodes {
      name test createdAt
      currentTotalPriceSet { shopMoney { amount } }
      totalRefundedSet { shopMoney { amount } }
      transactions(first: 20) {
        kind status gateway
        amountSet { shopMoney { amount } }
        fees { amount { amount } }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const toCents = (amount: string | undefined): number => Math.round(Number(amount ?? 0) * 100);

function emptySums(): StorePeriodSums {
  return { orders: 0, valueCents: 0, refundedCents: 0, feesCents: 0, gatewaysCents: {} };
}

export async function computeFinancialSnapshot(now = new Date()): Promise<FinancialSnapshot> {
  const todayEt = storeDate(now.toISOString());
  const weekStartEt = storeDate(new Date(now.getTime() - 6 * 864e5).toISOString());
  const monthStartEt = `${todayEt.slice(0, 7)}-01`;
  // One fetch covers all periods (last7 can reach into the prior month).
  const fetchStartEt = weekStartEt < monthStartEt ? weekStartEt : monthStartEt;
  // ET date → the UTC instant the store's day started (Shopify query wants a
  // timestamp; the store runs America/New_York, UTC−4 or −5). Take the wider
  // −5 bound and re-filter precisely by storeDate below.
  const sinceUtc = `${fetchStartEt}T00:00:00-05:00`;

  const orders = await shopifyPaginate<LightOrder>(
    LIGHT_QUERY,
    { q: `created_at:>='${sinceUtc}'` },
    'orders',
  );

  const periods = { today: emptySums(), last7: emptySums(), mtd: emptySums() };
  for (const o of orders) {
    if (o.test) continue;
    const etDate = storeDate(o.createdAt);
    const valueCents = toCents(o.currentTotalPriceSet?.shopMoney?.amount);
    const refundedCents = toCents(o.totalRefundedSet?.shopMoney?.amount);
    let feesCents = 0;
    const gateways: Array<[string, number]> = [];
    for (const t of o.transactions ?? []) {
      if (t.status !== 'SUCCESS' || (t.kind !== 'SALE' && t.kind !== 'CAPTURE')) continue;
      gateways.push([t.gateway, toCents(t.amountSet?.shopMoney?.amount)]);
      feesCents += (t.fees ?? []).reduce((s, f) => s + toCents(f.amount?.amount), 0);
    }
    for (const [key, inPeriod] of [
      ['today', etDate === todayEt],
      ['last7', etDate >= weekStartEt],
      ['mtd', etDate >= monthStartEt && etDate.slice(0, 7) === todayEt.slice(0, 7)],
    ] as const) {
      if (!inPeriod) continue;
      const sums = periods[key];
      sums.orders += 1;
      sums.valueCents += valueCents;
      sums.refundedCents += refundedCents;
      sums.feesCents += feesCents;
      for (const [gw, cents] of gateways) {
        sums.gatewaysCents[gw] = (sums.gatewaysCents[gw] ?? 0) + cents;
      }
    }
  }

  let nextPayout: UpcomingPayout | null = null;
  try {
    nextPayout = await fetchUpcomingPayout();
    if (!nextPayout) {
      // No payout record yet (Shopify creates it near payout day) — show
      // the balance accumulating toward it instead.
      const pending = await fetchPendingBalance();
      if (pending != null) nextPayout = { issuedAt: null, netAmount: pending, status: 'PENDING_BALANCE' };
    }
  } catch {
    nextPayout = null;
  }

  return { computedAt: now.toISOString(), periods, nextPayout };
}
