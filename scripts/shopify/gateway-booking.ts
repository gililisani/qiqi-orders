/**
 * Phase B runner — PayPal (100504) + Affirm (100503) fee/transfer booking.
 * Owner decisions 2026-08-24: next-event-onward handoff (bookkeeper's
 * existing journals are ADOPTED by amount±5d match, never re-booked),
 * PayPal fees monthly (622060), Affirm fees per engine deposit (710130).
 *
 * Dry-run by default — prints book vs adopt vs park. `--apply` writes
 * journals to PRODUCTION NetSuite (idempotent via the QQPP-/QQAF- external ids).
 *   NODE_PATH=$PWD/node_modules npx tsx scripts/shopify/gateway-booking.ts [--apply] [--from 2026-06-01]
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { fetchPaypalTransactions } from '../../lib/shopify/gateways/paypal';
import { fetchAffirmEvents } from '../../lib/shopify/gateways/affirm';
import { buildPaypalPlan, buildAffirmPlan, type ExistingJournal, type GatewayJournalPlan } from '../../lib/shopify/core/gatewayBooking';
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';
import { centsToDecimal } from '../../lib/shopify/core/money';
import { normalizeNsDate } from '../../lib/netsuite';

const APPLY = process.argv.includes('--apply');
const argOf = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const FROM = argOf('from') ?? '2026-06-01';
const TODAY = new Date().toISOString().slice(0, 10);
const ACCT = { bank: '938', paypal: { clearing: '1021', fee: '1858', num: '100504' }, affirm: { clearing: '1026', fee: '2381', num: '100503' } };
const SUBSIDIARY = '3'; // Qiqi INC

async function existingJournals(ns: any, clearingId: string): Promise<ExistingJournal[]> {
  const rows = await ns.suiteQL(`SELECT t.id, t.trandate, tal.amount FROM transactionaccountingline tal JOIN transaction t ON t.id = tal.transaction WHERE tal.account = ${clearingId} AND tal.posting = 'T' AND t.type = 'Journal' AND t.externalid IS NULL AND t.trandate >= TO_DATE('${FROM}','YYYY-MM-DD') - 10`);
  return rows.map((r: any) => ({ id: String(r.id), date: normalizeNsDate(r.trandate), clearingCents: Math.round(Number(r.amount) * 100) }));
}

async function book(ns: any, plan: GatewayJournalPlan, clearingId: string, counterId: string, label: string): Promise<string> {
  let id = await ns.findRecordIdByExternalId('journalEntry', plan.externalId);
  if (id) return `${plan.externalId} exists (${id})`;
  const legs = [
    { account: counterId, cents: plan.cents },
    { account: clearingId, cents: -plan.cents },
  ];
  id = await ns.createRecord('journalEntry', {
    externalId: plan.externalId,
    subsidiary: { id: SUBSIDIARY },
    tranDate: plan.tranDate,
    memo: plan.memo,
    line: { items: legs.filter((l) => l.cents !== 0).map((l) => ({ account: { id: l.account }, ...(l.cents > 0 ? { debit: Number(centsToDecimal(l.cents)) } : { credit: Number(centsToDecimal(-l.cents)) }), memo: plan.memo })) },
  });
  return `${plan.externalId} → journal ${id} (${label})`;
}

async function main() {
  const ns: any = createNetSuiteForTarget('production');
  console.log(APPLY ? '*** APPLY MODE — writing journals to PRODUCTION ***' : `--- DRY RUN (no writes) · window ${FROM} → ${TODAY} ---`);

  // ---- PayPal ----
  const ppTxns = await fetchPaypalTransactions({ from: FROM, to: TODAY });
  const ppExisting = await existingJournals(ns, ACCT.paypal.clearing);
  const pp = buildPaypalPlan(ppTxns, ppExisting, { feeFromMonth: '2026-08', currentMonth: TODAY.slice(0, 7) });
  console.log(`\nPayPal: ${ppTxns.length} txns · ${pp.saleCount} sales/refunds (order side = Loop A) · ${pp.transfers.length} withdrawals · ${pp.monthlyFees.length} monthly fee journals · ${pp.disputes.length} disputes/holds`);
  for (const t of pp.transfers) console.log(`  ${t.adoptedJournalId ? 'ADOPT' : 'BOOK '} ${t.externalId} ${t.tranDate} $${(t.cents / 100).toFixed(2)}${t.adoptedJournalId ? ` (bookkeeper journal ${t.adoptedJournalId})` : ''}`);
  for (const f of pp.monthlyFees) console.log(`  BOOK  ${f.externalId} ${f.tranDate} $${(f.cents / 100).toFixed(2)} → 622060`);
  for (const d of pp.disputes) console.log(`  PARK  dispute/hold ${d.code} ${d.date} $${(d.cents / 100).toFixed(2)} (${d.transactionId}) — manual/CPA`);
  for (const i of pp.issues) console.log(`  ⚠ ${i}`);

  // ---- Affirm ----
  const afEvents = await fetchAffirmEvents({ after: FROM, before: TODAY });
  const afExisting = await existingJournals(ns, ACCT.affirm.clearing);
  const af = buildAffirmPlan(afEvents, afExisting);
  console.log(`\nAffirm: ${afEvents.length} events · ${af.deposits.length} deposits · ${af.fees.length} fee journals · her-deposit fees to catch-up: $${(af.skippedFeeCents / 100).toFixed(2)}`);
  for (const d of af.deposits) console.log(`  ${d.adoptedJournalId ? 'ADOPT' : 'BOOK '} ${d.externalId} ${d.tranDate} $${(d.cents / 100).toFixed(2)}${d.adoptedJournalId ? ` (bookkeeper journal ${d.adoptedJournalId})` : ''}`);
  for (const f of af.fees) console.log(`  BOOK  ${f.externalId} ${f.tranDate} $${(f.cents / 100).toFixed(2)} → 710130`);
  for (const i of af.issues) console.log(`  ⚠ ${i}`);

  if (!APPLY) return;
  console.log('');
  for (const t of pp.transfers.filter((x) => !x.adoptedJournalId)) console.log('  ' + (await book(ns, t, ACCT.paypal.clearing, ACCT.bank, 'PayPal transfer')));
  for (const f of pp.monthlyFees) console.log('  ' + (await book(ns, f, ACCT.paypal.clearing, ACCT.paypal.fee, 'PayPal fees')));
  for (const d of af.deposits.filter((x) => !x.adoptedJournalId)) console.log('  ' + (await book(ns, d, ACCT.affirm.clearing, ACCT.bank, 'Affirm deposit')));
  for (const f of af.fees) console.log('  ' + (await book(ns, f, ACCT.affirm.clearing, ACCT.affirm.fee, 'Affirm fees')));
  // read-back: clearing balances vs expectation
  for (const [label, id] of [['100504 PayPal', ACCT.paypal.clearing], ['100503 Affirm', ACCT.affirm.clearing]] as const) {
    const [b] = await ns.suiteQL(`SELECT SUM(tal.amount) AS bal FROM transactionaccountingline tal WHERE tal.account = ${id} AND tal.posting = 'T'`);
    console.log(`  ${label} balance now: $${Number(b.bal).toFixed(2)}`);
  }
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 400)); process.exit(1); });
