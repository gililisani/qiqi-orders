#!/usr/bin/env tsx
/**
 * 2026 settlement analysis — PayPal + Affirm vs NetSuite. READ-ONLY:
 * fetches gateway activity through the production-validated clients
 * (lib/shopify/gateways/*), builds the booking PLANS, pulls what the
 * bookkeeper already posted to the clearing accounts, and prints the
 * comparison. WRITES NOTHING anywhere (owner directive 2026-09-07 —
 * analysis first, execution only after sign-off).
 *
 *   npx tsx scripts/settlements/analyze-2026.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createNetSuiteAPI } from '../../lib/netsuite';
import { fetchPaypalTransactions } from '../../lib/shopify/gateways/paypal';
import { fetchAffirmEvents } from '../../lib/shopify/gateways/affirm';
import { planPaypal, planAffirm } from '../../lib/settlements/plan';
import { SETTLEMENT_CONFIG } from '../../lib/settlements/config';

const FROM = '2026-01-01';
const money = (n: number) => `$${n.toFixed(2)}`;

interface NsLine {
  type: string;
  tranid: string;
  trandate: string; // DD/MM/YYYY (account quirk)
  amount: number;
  memo: string;
}

async function fetchNsClearingActivity(accountId: string): Promise<NsLine[]> {
  const ns = createNetSuiteAPI();
  const rows = await ns.suiteQLPaged<Record<string, string>>(
    `SELECT t.type, t.tranid, t.trandate, tal.amount, t.memo ` +
      `FROM transactionaccountingline tal JOIN transaction t ON t.id = tal.transaction ` +
      `WHERE tal.account = ${Number(accountId)} AND t.trandate >= TO_DATE('${FROM}','YYYY-MM-DD')`
  );
  return rows.map((r) => ({
    type: String(r.type ?? ''),
    tranid: String(r.tranid ?? ''),
    trandate: String(r.trandate ?? ''),
    amount: Number(r.amount) || 0,
    memo: String(r.memo ?? ''),
  }));
}

/** DD/MM/YYYY → YYYY-MM (the SuiteQL date quirk on this account). */
const nsMonth = (ddmmyyyy: string) => {
  const [, mm, yyyy] = ddmmyyyy.split('/');
  return `${yyyy}-${mm}`;
};

async function analyzePaypal() {
  console.log('\n================ PAYPAL ================');
  const today = new Date().toISOString().slice(0, 10);
  const txs = await fetchPaypalTransactions({ from: FROM, to: today });
  const plan = planPaypal(txs);

  console.log(
    `PayPal 2026 activity: ${plan.salesCount} sales ${money(plan.salesGross)}, ` +
      `${plan.refundsCount} refunds ${money(plan.refundsGross)}`
  );
  if (plan.unclassified.length) {
    console.log('⚠ UNCLASSIFIED event codes (triage before execution):');
    for (const u of plan.unclassified)
      console.log(`   ${u.eventCode}: n=${u.count} total=${money(u.total)}`);
  }

  const nsLines = await fetchNsClearingActivity(SETTLEMENT_CONFIG.paypal.clearingAccountId);
  const nsFeeByMonth = new Map<string, number>();
  const nsTransfers: NsLine[] = [];
  for (const l of nsLines) {
    // Bookkeeper fee entries reduce the clearing account (negative) with
    // "fee" in the memo; transfer-like entries are the other negatives.
    // Tolerant match, as always.
    if (l.amount < 0 && /fee/i.test(l.memo)) {
      nsFeeByMonth.set(nsMonth(l.trandate), (nsFeeByMonth.get(nsMonth(l.trandate)) ?? 0) + -l.amount);
    } else if (l.amount < 0 && (l.type === 'Journal' || l.type === 'Deposit')) {
      nsTransfers.push(l);
    }
  }

  console.log('\nFee comparison per month (plan vs already in NS):');
  const months = new Set([...plan.feeBills.map((b) => b.periodKey), ...nsFeeByMonth.keys()]);
  for (const m of Array.from(months).sort()) {
    const planned = plan.feeBills.find((b) => b.periodKey === m)?.feeTotal ?? 0;
    const inNs = nsFeeByMonth.get(m) ?? 0;
    const delta = planned - inNs;
    console.log(
      `  ${m}: PayPal says ${money(planned)} · NS has ${money(inNs)}` +
        (Math.abs(delta) >= 0.01 ? `  → MISSING ${money(delta)}` : '  ✓')
    );
  }

  console.log(`\nWithdrawals PayPal reports (journal plan, dated on initiation):`);
  if (plan.withdrawalJournals.length === 0) console.log('  (none in 2026)');
  for (const w of plan.withdrawalJournals)
    console.log(`  ${w.date}  ${money(w.amount)}  (${w.reference})`);
  console.log(`NS transfer-like entries on 100504 (journals/deposits, non-fee):`);
  if (nsTransfers.length === 0) console.log('  (none)');
  for (const t of nsTransfers)
    console.log(`  ${t.trandate}  ${money(-t.amount)}  ${t.tranid}  ${t.memo.slice(0, 50)}`);
}

async function analyzeAffirm() {
  console.log('\n================ AFFIRM ================');
  const today = new Date().toISOString().slice(0, 10);
  const events = await fetchAffirmEvents({ after: FROM, before: today });
  const plan = planAffirm(events);
  console.log(`Affirm 2026: ${events.length} settlement events across ${plan.deposits.length} deposits`);

  const nsLines = await fetchNsClearingActivity(SETTLEMENT_CONFIG.affirm.clearingAccountId);
  const nsOut = nsLines.filter((l) => l.amount < 0);

  console.log('\nPayout journal plan vs NS entries (match by amount):');
  const nsMatched = new Set<number>();
  for (const j of plan.payoutJournals) {
    const idx = nsOut.findIndex(
      (l, i) => !nsMatched.has(i) && Math.abs(-l.amount - j.amount) < 0.01
    );
    if (idx >= 0) {
      nsMatched.add(idx);
      console.log(
        `  ✓ ${j.date} ${money(j.amount)} ↔ NS ${nsOut[idx].tranid} (${nsOut[idx].trandate})`
      );
    } else {
      console.log(`  → MISSING in NS: ${j.date} ${money(j.amount)} (${j.reference})`);
    }
  }
  const unmatchedNs = nsOut.filter((_, i) => !nsMatched.has(i));
  if (unmatchedNs.length) {
    console.log('NS entries with no matching Affirm deposit (fees, or pre-2026 payouts):');
    for (const l of unmatchedNs)
      console.log(`  ${l.trandate} ${money(-l.amount)} ${l.tranid} ${l.memo.slice(0, 50)}`);
  }
  console.log(
    `\nFee bill plan: ${plan.feeBills.length} bills totalling ${money(plan.feeBills.reduce((s, b) => s + b.feeTotal, 0))}`
  );
}

async function main() {
  console.log('READ-ONLY analysis — nothing is written to NetSuite or anywhere else.');
  await analyzePaypal();
  await analyzeAffirm();
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
