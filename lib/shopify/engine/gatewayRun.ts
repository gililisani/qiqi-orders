/**
 * Phase B runner — PayPal (100504) + Affirm (100503) fee/transfer booking,
 * shared by the daily cron (sequential, after the Shopify payout run) and
 * scripts/shopify/gateway-booking.ts. Owner decisions 2026-08-24:
 * next-event-onward handoff (existing bookkeeper journals adopted by
 * amount±5d match), PayPal fees monthly → 622060 (closed months only),
 * Affirm fees per engine-booked deposit → 710130. Idempotent via
 * QQPP-/QQAF- external ids.
 */
import { fetchPaypalTransactions } from '../gateways/paypal';
import { fetchAffirmEvents } from '../gateways/affirm';
import { buildPaypalPlan, buildAffirmPlan, type ExistingJournal, type GatewayJournalPlan } from '../core/gatewayBooking';
import { centsToDecimal } from '../core/money';
import type { NsApi } from './pipeline';
import { normalizeNsDate } from '../../netsuite';

const ACCT = { bank: '938', paypal: { clearing: '1021', fee: '1858' }, affirm: { clearing: '1026', fee: '2381' } };
const SUBSIDIARY = '3'; // Qiqi INC
const FEE_FROM_MONTH = '2026-08'; // handoff month — earlier fees are CPA catch-up material

export interface GatewayRunResult {
  paypal: { booked: string[]; adopted: number; disputes: number; issues: string[] };
  affirm: { booked: string[]; adopted: number; skippedFeeCents: number; issues: string[] };
  errors: string[];
}

async function existingJournals(ns: NsApi, clearingId: string, from: string): Promise<ExistingJournal[]> {
  const rows = await ns.suiteQL(
    `SELECT t.id, t.trandate, tal.amount FROM transactionaccountingline tal JOIN transaction t ON t.id = tal.transaction WHERE tal.account = ${clearingId} AND tal.posting = 'T' AND t.type = 'Journal' AND t.externalid IS NULL AND t.trandate >= TO_DATE('${from}','YYYY-MM-DD') - 10`,
  );
  return rows.map((r: any) => ({
    id: String(r.id),
    // SuiteQL returns DD/MM/YYYY on this account — always normalize.
    date: normalizeNsDate(r.trandate) ?? String(r.trandate).slice(0, 10),
    clearingCents: Math.round(Number(r.amount) * 100),
  }));
}

async function book(ns: NsApi, plan: GatewayJournalPlan, clearingId: string, counterId: string): Promise<string> {
  const found = await ns.findRecordIdByExternalId('journalEntry', plan.externalId);
  if (found) return `${plan.externalId} exists (${found})`;
  const legs = [
    { account: counterId, cents: plan.cents },
    { account: clearingId, cents: -plan.cents },
  ];
  const id = await ns.createRecord('journalEntry', {
    externalId: plan.externalId,
    subsidiary: { id: SUBSIDIARY },
    tranDate: plan.tranDate,
    memo: plan.memo,
    line: {
      items: legs
        .filter((l) => l.cents !== 0)
        .map((l) => ({
          account: { id: l.account },
          ...(l.cents > 0 ? { debit: Number(centsToDecimal(l.cents)) } : { credit: Number(centsToDecimal(-l.cents)) }),
          memo: plan.memo,
        })),
    },
  });
  return `${plan.externalId} → journal ${id}`;
}

/**
 * Book new gateway entries. Window: start of the previous month → today,
 * so the monthly PayPal fee journal always sees its full month.
 */
export async function bookGatewayEntries(opts: { ns: NsApi; apply: boolean; log?: (l: string) => void }): Promise<GatewayRunResult> {
  const log = opts.log ?? (() => {});
  const today = new Date().toISOString().slice(0, 10);
  const prevMonthStart = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
  const result: GatewayRunResult = {
    paypal: { booked: [], adopted: 0, disputes: 0, issues: [] },
    affirm: { booked: [], adopted: 0, skippedFeeCents: 0, issues: [] },
    errors: [],
  };

  try {
    const txns = await fetchPaypalTransactions({ from: prevMonthStart, to: today });
    const existing = await existingJournals(opts.ns, ACCT.paypal.clearing, prevMonthStart);
    const plan = buildPaypalPlan(txns, existing, { feeFromMonth: FEE_FROM_MONTH, currentMonth: today.slice(0, 7) });
    result.paypal.adopted = plan.transfers.filter((t) => t.adoptedJournalId).length;
    result.paypal.disputes = plan.disputes.length;
    result.paypal.issues = plan.issues;
    for (const p of [...plan.transfers.filter((t) => !t.adoptedJournalId), ...plan.monthlyFees]) {
      log(`paypal ${p.kind} ${p.externalId} ${p.tranDate} $${(p.cents / 100).toFixed(2)}`);
      if (opts.apply) result.paypal.booked.push(await book(opts.ns, p, ACCT.paypal.clearing, p.kind === 'fee' ? ACCT.paypal.fee : ACCT.bank));
    }
  } catch (e: any) {
    result.errors.push(`paypal: ${String(e?.message ?? e).slice(0, 300)}`);
  }

  try {
    const events = await fetchAffirmEvents({ after: prevMonthStart, before: today });
    const existing = await existingJournals(opts.ns, ACCT.affirm.clearing, prevMonthStart);
    const plan = buildAffirmPlan(events, existing);
    result.affirm.adopted = plan.deposits.filter((d) => d.adoptedJournalId).length;
    result.affirm.skippedFeeCents = plan.skippedFeeCents;
    result.affirm.issues = plan.issues;
    for (const p of [...plan.deposits.filter((d) => !d.adoptedJournalId), ...plan.fees]) {
      log(`affirm ${p.kind} ${p.externalId} ${p.tranDate} $${(p.cents / 100).toFixed(2)}`);
      if (opts.apply) result.affirm.booked.push(await book(opts.ns, p, ACCT.affirm.clearing, p.kind === 'fee' ? ACCT.affirm.fee : ACCT.bank));
    }
  } catch (e: any) {
    result.errors.push(`affirm: ${String(e?.message ?? e).slice(0, 300)}`);
  }

  return result;
}
