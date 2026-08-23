/**
 * Fetch Shopify Payments balance transactions for a store-date window
 * (newest-first paging until we are past `from`). Input for the 100501
 * statement (core/statement.ts). Read-only.
 */
import { shopifyGraphQL } from './client';
import { storeDate } from './core/dates';
import type { ShopifyBalanceTxn } from './core/payoutTransform';

const BT_FIELDS = `id transactionDate type test amount { amount } fee { amount } net { amount } sourceId sourceType adjustmentReason associatedOrder { id name } associatedPayout { id }`;

export async function fetchBalanceTransactions(opts: { from: string; to: string; cap?: number }): Promise<ShopifyBalanceTxn[]> {
  const out: ShopifyBalanceTxn[] = [];
  let cursor: string | null = null;
  let fetched = 0;
  const cap = opts.cap ?? 20000;
  while (fetched < cap) {
    const page: any = await shopifyGraphQL(
      `query BT($cursor: String) { shopifyPaymentsAccount { balanceTransactions(first: 100, after: $cursor, reverse: true) { nodes { ${BT_FIELDS} } pageInfo { hasNextPage endCursor } } } }`,
      { cursor },
    );
    const conn = page.shopifyPaymentsAccount?.balanceTransactions;
    if (!conn) break;
    fetched += conn.nodes.length;
    let pastFrom = false;
    for (const t of conn.nodes as ShopifyBalanceTxn[]) {
      const d = storeDate(t.transactionDate);
      // Keep a few days before `from` too: a payout's synthetic lines are
      // dated by its TRANSFER, which can sit after the window start while
      // its charges sit before it; the window filter runs on the lines.
      if (d <= opts.to) out.push(t);
      if (d < opts.from) pastFrom = true;
    }
    // Stop once a full page is entirely before `from` minus slack (14d covers a weekly payout's charge window).
    const slack = new Date(new Date(opts.from).getTime() - 14 * 864e5).toISOString().slice(0, 10);
    if (!conn.pageInfo.hasNextPage || (pastFrom && conn.nodes.every((t: ShopifyBalanceTxn) => storeDate(t.transactionDate) < slack))) break;
    cursor = conn.pageInfo.endCursor;
  }
  return out;
}

/**
 * Payout issue dates (gid → YYYY-MM-DD) for payouts whose issue date falls in
 * [from − 14d, to + 14d]. The engine dates payout journals by issuedAt, so
 * the statement's payout/fee/tax/dispute lines must carry the same date
 * (Shopify stamps the TRANSFER transaction up to two days earlier).
 */
export async function fetchPayoutIssueDates(opts: { from: string; to: string }): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const lo = new Date(new Date(opts.from).getTime() - 14 * 864e5).toISOString().slice(0, 10);
  const hi = new Date(new Date(opts.to).getTime() + 14 * 864e5).toISOString().slice(0, 10);
  let cursor: string | null = null;
  for (let i = 0; i < 40; i++) {
    const page: any = await shopifyGraphQL(
      `query P($cursor: String) { shopifyPaymentsAccount { payouts(first: 50, after: $cursor, sortKey: ISSUED_AT, reverse: true) { nodes { id issuedAt } pageInfo { hasNextPage endCursor } } } }`,
      { cursor },
    );
    const conn = page.shopifyPaymentsAccount?.payouts;
    if (!conn) break;
    let past = false;
    for (const p of conn.nodes) {
      const d = String(p.issuedAt).slice(0, 10);
      if (d >= lo && d <= hi) out.set(p.id, d);
      if (d < lo) past = true;
    }
    if (past || !conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return out;
}
