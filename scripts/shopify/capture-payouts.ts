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
      payoutSchedule { interval weeklyAnchor }
      payouts(first: 20) {
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
  console.log('schedule:', JSON.stringify(acct.payoutSchedule), 'balance:', JSON.stringify(acct.balance));
  for (const p of acct.payouts.nodes) {
    console.log(
      `PAYOUT ${p.legacyResourceId} ${p.issuedAt} ${p.status} net=$${p.net.amount} ` +
        `charges=$${p.summary.chargesGross.amount} fees=$${p.summary.chargesFee.amount} refunds=$${p.summary.refundsFeeGross.amount}`,
    );
  }
  fs.writeFileSync(path.join(OUT, 'payouts-list.json'), JSON.stringify(acct, null, 2));

  // Balance transactions for the two most recent paid payouts.
  const recent = acct.payouts.nodes.filter((p: any) => p.status === 'PAID').slice(0, 2);
  for (const p of recent) {
    const txns = await shopifyPaginate(
      `query BT($q: String!, $cursor: String) {
        shopifyPaymentsAccount {
          balanceTransactions(first: 100, after: $cursor, query: $q) {
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
      { q: `payout_id:${p.legacyResourceId}` },
      'shopifyPaymentsAccount.balanceTransactions',
    );
    console.log(`payout ${p.legacyResourceId}: ${txns.length} balance transactions`);
    const byType = new Map<string, number>();
    for (const t of txns as any[]) byType.set(t.type, (byType.get(t.type) ?? 0) + 1);
    console.log('  types:', JSON.stringify([...byType.entries()]));
    fs.writeFileSync(path.join(OUT, `payout-${p.legacyResourceId}-transactions.json`), JSON.stringify(txns, null, 2));
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
