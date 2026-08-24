/**
 * Phase B transforms (pure): gateway ledgers → NS booking plans for the
 * PayPal (100504) and Affirm (100503) clearing accounts.
 *
 * Owner decisions (2026-08-24): handoff = NEXT EVENT ONWARD — anything
 * the bookkeeper already journaled stays hers (the engine detects hers
 * by amount+date against existing 100504/100503 journals and ADOPTS
 * instead of booking); PayPal fees book MONTHLY (Dr 622060 / Cr 100504,
 * dated month-end); Affirm fees book PER SETTLEMENT EVENT (Dr 710130 /
 * Cr 100503, disbursed date) but only for engine-booked deposits — fees
 * belonging to her deposits accumulate into the catch-up report instead.
 *
 * Principle 3 (loud failure): unknown PayPal event codes are surfaced,
 * never silently skipped.
 */
import { toCents } from './money';
import type { PaypalTxn } from '../gateways/paypal';
import type { AffirmEvent } from '../gateways/affirm';

export interface ExistingJournal {
  id: string;
  date: string; // YYYY-MM-DD
  /** Signed cents on the clearing account (negative = money left it). */
  clearingCents: number;
}

export interface GatewayJournalPlan {
  externalId: string;
  tranDate: string;
  memo: string;
  /** Positive cents = debit bank/expense, credit clearing. */
  cents: number;
  kind: 'transfer' | 'fee' | 'deposit';
  /** Set when an existing bookkeeper journal covers this — adopt, do not book. */
  adoptedJournalId?: string;
}

const day = (iso: string) => String(iso).slice(0, 10);
const near = (a: string, b: string, days: number) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 864e5 <= days;

/** Match an outgoing amount against the bookkeeper's existing journals (amount exact, date ±tolerance). */
function findExisting(existing: ExistingJournal[], used: Set<string>, cents: number, date: string, tolDays: number): ExistingJournal | null {
  const hit = existing.find((j) => !used.has(j.id) && j.clearingCents === -cents && near(j.date, date, tolDays));
  if (hit) used.add(hit.id);
  return hit ?? null;
}

// ---- PayPal ----

export interface PaypalPlanResult {
  transfers: GatewayJournalPlan[];
  monthlyFees: GatewayJournalPlan[];
  /** Sales/refund gross events — already booked per order by Loop A; listed for reconciliation counts. */
  saleCount: number;
  disputes: Array<{ transactionId: string; date: string; cents: number; code: string }>;
  issues: string[];
}

const PP_SALE_CODES = new Set(['T0006', 'T0000', 'T0001', 'T0003', 'T0007', 'T0011', 'T0013']);
const PP_REFUND_CODES = new Set(['T1107', 'T1201']);
const PP_WITHDRAWAL_PREFIX = 'T04'; // withdrawals to bank
const PP_DISPUTE_PREFIX = 'T11'; // holds/reserves/disputes (T1105 hold, T1110 hold, T1111 release, ...)

export function buildPaypalPlan(txns: PaypalTxn[], existing: ExistingJournal[], opts: { feeFromMonth: string; currentMonth: string }): PaypalPlanResult {
  const result: PaypalPlanResult = { transfers: [], monthlyFees: [], saleCount: 0, disputes: [], issues: [] };
  const used = new Set<string>();
  const feeByMonth = new Map<string, number>();
  for (const t of txns) {
    if (t.status !== 'S' && t.status !== 'P') continue; // settled/pending only
    const cents = toCents(t.amount);
    const feeCents = toCents(t.fee);
    const code = t.eventCode;
    if (PP_SALE_CODES.has(code) || PP_REFUND_CODES.has(code)) {
      result.saleCount += 1;
      if (feeCents !== 0) {
        const m = day(t.date).slice(0, 7);
        feeByMonth.set(m, (feeByMonth.get(m) ?? 0) + -feeCents); // fee is negative → positive expense
      }
      continue;
    }
    if (code.startsWith(PP_WITHDRAWAL_PREFIX)) {
      const amt = -cents; // withdrawal amount is negative → positive transfer
      const date = day(t.date);
      const hers = findExisting(existing, used, amt, date, 5);
      result.transfers.push({
        externalId: `QQPP-XFER-${t.transactionId}`,
        tranDate: date,
        memo: `PayPal withdrawal ${t.transactionId}`,
        cents: amt,
        kind: 'transfer',
        ...(hers ? { adoptedJournalId: hers.id } : {}),
      });
      continue;
    }
    if (code.startsWith(PP_DISPUTE_PREFIX)) {
      result.disputes.push({ transactionId: t.transactionId, date: day(t.date), cents, code });
      continue;
    }
    result.issues.push(`unknown PayPal event code ${code} (${t.transactionId}, ${day(t.date)}, $${t.amount})`);
  }
  for (const [m, cents] of [...feeByMonth.entries()].sort()) {
    // Only CLOSED months: booking the current month early would freeze the
    // amount behind its external id and orphan the rest of the month's fees.
    if (m < opts.feeFromMonth || m >= opts.currentMonth || cents === 0) continue;
    const lastDay = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
    result.monthlyFees.push({ externalId: `QQPP-FEE-${m}`, tranDate: lastDay, memo: `PayPal processing fees ${m}`, cents, kind: 'fee' });
  }
  return result;
}

// ---- Affirm ----

export interface AffirmPlanResult {
  deposits: GatewayJournalPlan[];
  fees: GatewayJournalPlan[];
  /** Fees belonging to the bookkeeper's (adopted) deposits — catch-up material, not booked. */
  skippedFeeCents: number;
  issues: string[];
}

export function buildAffirmPlan(events: AffirmEvent[], existing: ExistingJournal[]): AffirmPlanResult {
  const result: AffirmPlanResult = { deposits: [], fees: [], skippedFeeCents: 0, issues: [] };
  const used = new Set<string>();
  const byDeposit = new Map<string, AffirmEvent[]>();
  for (const e of events) {
    if (e.eventType !== 'loan_captured' && e.eventType !== 'loan_capture' && e.eventType !== 'loan_refunded' && e.eventType !== 'loan_refund') {
      result.issues.push(`unknown Affirm event type ${e.eventType} (${e.id}, ${e.date})`);
      continue;
    }
    (byDeposit.get(e.depositId) ?? byDeposit.set(e.depositId, []).get(e.depositId)!).push(e);
  }
  for (const [depositId, evs] of byDeposit) {
    const date = day(evs[0].date);
    const settled = evs.reduce((s, e) => s + e.totalSettledCents, 0);
    if (settled === 0) continue; // e.g. capture+refund cancelling within one deposit
    const hers = findExisting(existing, used, settled, date, 5);
    result.deposits.push({
      externalId: `QQAF-DEP-${depositId}`,
      tranDate: date,
      memo: `Affirm deposit ${depositId}`,
      cents: settled,
      kind: 'deposit',
      ...(hers ? { adoptedJournalId: hers.id } : {}),
    });
    const feeCents = -evs.reduce((s, e) => s + e.feesCents, 0); // negative → positive expense
    if (feeCents === 0) continue;
    if (hers) {
      result.skippedFeeCents += feeCents;
    } else {
      result.fees.push({ externalId: `QQAF-FEE-${depositId}`, tranDate: date, memo: `Affirm fees · deposit ${depositId}`, cents: feeCents, kind: 'fee' });
    }
  }
  return result;
}
