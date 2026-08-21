/**
 * L1 — fetch Shopify Payments payouts + their balance transactions.
 * The payouts list is oldest-first (reverse:true needed) and the
 * `payout_id:` query filter is silently ignored, so balance transactions
 * are paged newest-first and grouped locally by associatedPayout.
 */
import { shopifyGraphQL } from './client';
import type { ShopifyBalanceTxn, ShopifyPayoutNode } from './core/payoutTransform';

export interface FetchedPayout {
  payout: ShopifyPayoutNode;
  txns: ShopifyBalanceTxn[];
}

export interface UpcomingPayout {
  /** Absent when this is the accumulating pending balance (no payout record yet). */
  issuedAt: string | null;
  netAmount: number;
  status: string;
}

/** Funds accumulated toward the next payout (Shopify Payments balance). */
export async function fetchPendingBalance(): Promise<number | null> {
  const data = await shopifyGraphQL(`{
    shopifyPaymentsAccount { balance { amount currencyCode } }
  }`);
  const balances: any[] = data.shopifyPaymentsAccount?.balance ?? [];
  const usd = balances.find((b) => b.currencyCode === 'USD') ?? balances[0];
  return usd ? Number(usd.amount) : null;
}

/** The next not-yet-paid payout (SCHEDULED/IN_TRANSIT), for the dashboard. */
export async function fetchUpcomingPayout(): Promise<UpcomingPayout | null> {
  const data = await shopifyGraphQL(`{
    shopifyPaymentsAccount {
      payouts(first: 5, reverse: true) {
        nodes { legacyResourceId issuedAt status net { amount } }
      }
    }
  }`);
  const nodes: any[] = data.shopifyPaymentsAccount?.payouts?.nodes ?? [];
  const upcoming = nodes.find((p) => p.status === 'SCHEDULED' || p.status === 'IN_TRANSIT');
  return upcoming
    ? { issuedAt: upcoming.issuedAt, netAmount: Number(upcoming.net.amount), status: upcoming.status }
    : null;
}

export async function fetchRecentPayouts(opts: { count: number }): Promise<FetchedPayout[]> {
  const data = await shopifyGraphQL(`{
    shopifyPaymentsAccount {
      payouts(first: ${Math.min(opts.count, 20)}, reverse: true) {
        nodes {
          id legacyResourceId issuedAt status transactionType
          net { amount currencyCode }
          summary {
            adjustmentsFee { amount }
            adjustmentsGross { amount }
            chargesFee { amount }
            chargesGross { amount }
            refundsFee { amount }
            refundsFeeGross { amount }
            reservedFundsFee { amount }
            reservedFundsGross { amount }
            retriedPayoutsFee { amount }
            retriedPayoutsGross { amount }
          }
        }
      }
    }
  }`);
  const payouts: ShopifyPayoutNode[] = data.shopifyPaymentsAccount.payouts.nodes.filter(
    (p: ShopifyPayoutNode) => p.status === 'PAID',
  );
  const wanted = new Map<string, ShopifyPayoutNode>(
    payouts.map((p) => [`gid://shopify/ShopifyPaymentsPayout/${p.legacyResourceId}`, p]),
  );

  const grouped = new Map<string, ShopifyBalanceTxn[]>();
  let cursor: string | null = null;
  let fetched = 0;
  // Newest-first paging until we've passed the oldest wanted payout's
  // charge window (a weekly payout's charges reach back ~7 days before
  // its issue date — use 14 days of slack) or a hard cap.
  const oldestIssued = payouts.length ? payouts[payouts.length - 1].issuedAt : null;
  const oldest = oldestIssued
    ? new Date(new Date(oldestIssued).getTime() - 14 * 864e5).toISOString().slice(0, 10)
    : null;
  while (fetched < 5000) {
    const page: any = await shopifyGraphQL(
      `query BT($cursor: String) {
        shopifyPaymentsAccount {
          balanceTransactions(first: 100, after: $cursor, reverse: true) {
            nodes {
              id transactionDate type test
              amount { amount }
              fee { amount }
              net { amount }
              sourceId sourceType
              adjustmentReason
              associatedOrder { id name }
              associatedPayout { id }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { cursor },
    );
    const conn = page.shopifyPaymentsAccount.balanceTransactions;
    fetched += conn.nodes.length;
    let pastOldest = false;
    for (const t of conn.nodes) {
      const pid = t.associatedPayout?.id;
      if (pid && wanted.has(pid)) {
        if (!grouped.has(pid)) grouped.set(pid, []);
        grouped.get(pid)!.push(t);
      }
      if (oldest && t.transactionDate && t.transactionDate.slice(0, 10) < oldest) pastOldest = true;
    }
    if (!conn.pageInfo.hasNextPage || pastOldest) break;
    cursor = conn.pageInfo.endCursor;
  }

  return payouts.map((p) => ({
    payout: p,
    txns: grouped.get(`gid://shopify/ShopifyPaymentsPayout/${p.legacyResourceId}`) ?? [],
  }));
}
