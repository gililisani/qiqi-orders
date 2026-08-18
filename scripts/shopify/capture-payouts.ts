/**
 * Read-only: capture recent Shopify Payments payouts + the balance
 * transactions composing them → fixtures for Loop E (payoutTransform).
 * Payout data carries no PII beyond order numbers, but raw stays in the
 * gitignored dir for consistency; committed copies via redact-fixtures.
 *
 *   npx tsx scripts/shopify/capture-payouts.ts
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { shopifyGraphQL, shopifyPaginate } from '../../lib/shopify/client';

const OUT = path.join(process.cwd(), 'tests', 'fixtures', 'shopify', 'raw');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const payouts = await shopifyGraphQL(`{
    shopifyPaymentsAccount {
      activated
      balance { amount currencyCode }

      payouts(first: 20, reverse: true) {
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
  const acct = payouts.shopifyPaymentsAccount;
  console.log('balance:', JSON.stringify(acct.balance));
  for (const p of acct.payouts.nodes) {
    console.log(
      `PAYOUT ${p.legacyResourceId} ${p.issuedAt} ${p.status} net=$${p.net.amount} ` +
        `charges=$${p.summary.chargesGross.amount} fees=$${p.summary.chargesFee.amount} refunds=$${p.summary.refundsFeeGross.amount}`,
    );
  }
  fs.writeFileSync(path.join(OUT, 'payouts-list.json'), JSON.stringify(acct, null, 2));

  // Balance transactions: the payout_id query filter is silently invalid
  // (returns everything), so page newest-first and group locally.
  const recent = acct.payouts.nodes.filter((p: any) => p.status === 'PAID').slice(0, 6);
  const wanted = new Set(recent.map((p: any) => `gid://shopify/ShopifyPaymentsPayout/${p.legacyResourceId}`));
  const grouped = new Map<string, any[]>();
  let cursor: string | null = null;
  let fetched = 0;
  while (fetched < 3000) {
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
    for (const t of conn.nodes) {
      const pid = t.associatedPayout?.id;
      if (pid && wanted.has(pid)) {
        if (!grouped.has(pid)) grouped.set(pid, []);
        grouped.get(pid)!.push(t);
      }
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  for (const p of recent) {
    const gid = `gid://shopify/ShopifyPaymentsPayout/${p.legacyResourceId}`;
    const txns = grouped.get(gid) ?? [];
    const byType = new Map<string, number>();
    let net = 0;
    for (const t of txns) {
      byType.set(t.type, (byType.get(t.type) ?? 0) + 1);
      net += Math.round(Number(t.net.amount) * 100);
    }
    console.log(
      `payout ${p.legacyResourceId} (${p.issuedAt.slice(0, 10)}): ${txns.length} txns, ` +
        `types=${JSON.stringify([...byType.entries()])}, txn-net=$${(net / 100).toFixed(2)} vs payout net=$${p.net.amount}`,
    );
    fs.writeFileSync(path.join(OUT, `payout-${p.legacyResourceId}-transactions.json`), JSON.stringify(txns, null, 2));
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
