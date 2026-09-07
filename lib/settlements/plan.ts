/**
 * Pure planning for PayPal/Affirm settlement booking — mirrors the Shopify
 * engine's plan/execute split. Consumes the PRODUCTION-VALIDATED gateway
 * clients that already power the CPA finance reports
 * (lib/shopify/gateways/{paypal,affirm}.ts) — do not duplicate those.
 *
 * These functions produce PLANS only; nothing here (or anywhere yet)
 * writes to NetSuite. Execution comes after the owner signs off on the
 * 2026 analysis.
 *
 * Owner-approved cadence (2026-09-07):
 *  - PayPal: ONE fee bill per month + ONE journal per withdrawal, dated on
 *    the withdrawal INITIATION date (bank matches the deposit days later).
 *  - Affirm: per payout/deposit — fee bill + net journal on the disbursed
 *    date, same 1:1 bank-matching property as Shopify Loop E.
 */

import type { PaypalTxn } from '../shopify/gateways/paypal';
import type { AffirmEvent } from '../shopify/gateways/affirm';

export interface FeeBillPlan {
  gateway: 'paypal' | 'affirm';
  /** PayPal: statement month 'YYYY-MM'. Affirm: the deposit date. */
  periodKey: string;
  feeTotal: number;
  transactionCount: number;
  memo: string;
}

export interface TransferJournalPlan {
  gateway: 'paypal' | 'affirm';
  /** Withdrawal initiation date (PayPal) / disbursed date (Affirm). */
  date: string;
  amount: number;
  reference: string; // PayPal transaction id / Affirm deposit id
  memo: string;
}

export interface PaypalPlan {
  feeBills: FeeBillPlan[];
  withdrawalJournals: TransferJournalPlan[];
  /** Sales/refund tallies — context for the analysis report. */
  salesGross: number;
  salesCount: number;
  refundsGross: number;
  refundsCount: number;
  /** Event codes the classifier didn't recognize — triage before execution. */
  unclassified: Array<{ eventCode: string; count: number; total: number }>;
}

// PayPal event-code families (Transaction Search):
//  T00xx  payments received (sales)
//  T11xx  refunds/reversals (their fee carries the fee give-back)
//  T04xx  withdrawals/transfers out to bank
//  T03xx  bank deposits INTO PayPal (not part of settlement booking)
//  T01xx  non-payment fees (e.g. chargeback fees)
const SALE = /^T00/;
const REFUND = /^T11/;
const WITHDRAWAL = /^T04/;
const NON_PAYMENT_FEE = /^T01/;
const IGNORED = /^T03/;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function planPaypal(transactions: PaypalTxn[]): PaypalPlan {
  const feeByMonth = new Map<string, { total: number; count: number }>();
  const withdrawals: TransferJournalPlan[] = [];
  let salesGross = 0,
    salesCount = 0,
    refundsGross = 0,
    refundsCount = 0;
  const unknown = new Map<string, { count: number; total: number }>();

  const addFee = (dateIso: string, fee: number) => {
    if (!fee) return;
    const month = dateIso.slice(0, 7);
    const cur = feeByMonth.get(month) ?? { total: 0, count: 0 };
    // PayPal reports fees negative on sales, positive give-backs on refunds;
    // flip so the bill total is a positive expense.
    cur.total += -fee;
    cur.count += 1;
    feeByMonth.set(month, cur);
  };

  for (const t of transactions) {
    // Only settled activity counts; pending/denied would double-book later.
    if (t.status && t.status !== 'S') continue;
    const amount = Number(t.amount) || 0;
    const fee = Number(t.fee) || 0;

    if (SALE.test(t.eventCode)) {
      salesGross += amount;
      salesCount += 1;
      addFee(t.date, fee);
    } else if (REFUND.test(t.eventCode)) {
      refundsGross += Math.abs(amount);
      refundsCount += 1;
      addFee(t.date, fee);
    } else if (WITHDRAWAL.test(t.eventCode)) {
      withdrawals.push({
        gateway: 'paypal',
        date: t.date.slice(0, 10),
        amount: round2(Math.abs(amount)),
        reference: t.transactionId,
        memo: `PayPal withdrawal ${t.transactionId} · ${t.date.slice(0, 10)}`,
      });
    } else if (NON_PAYMENT_FEE.test(t.eventCode)) {
      // Chargeback/misc fees: the whole amount is a fee.
      addFee(t.date, amount < 0 ? amount : -amount);
    } else if (!IGNORED.test(t.eventCode)) {
      const u = unknown.get(t.eventCode) ?? { count: 0, total: 0 };
      u.count += 1;
      u.total += amount;
      unknown.set(t.eventCode, u);
    }
  }

  const feeBills: FeeBillPlan[] = Array.from(feeByMonth.entries())
    .filter(([, v]) => Math.abs(v.total) >= 0.01)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      gateway: 'paypal' as const,
      periodKey: month,
      feeTotal: round2(v.total),
      transactionCount: v.count,
      memo: `PayPal processing fees ${month}`,
    }));

  return {
    feeBills,
    withdrawalJournals: withdrawals.sort((a, b) => a.date.localeCompare(b.date)),
    salesGross: round2(salesGross),
    salesCount,
    refundsGross: round2(refundsGross),
    refundsCount,
    unclassified: Array.from(unknown.entries()).map(([eventCode, v]) => ({
      eventCode,
      count: v.count,
      total: round2(v.total),
    })),
  };
}

export interface AffirmDeposit {
  depositId: string;
  date: string;
  fees: number; // positive expense
  net: number;
  events: number;
}

export interface AffirmPlan {
  deposits: AffirmDeposit[];
  feeBills: FeeBillPlan[];
  payoutJournals: TransferJournalPlan[];
}

/** Group settlement events into deposits (Affirm pays out per deposit_id). */
export function planAffirm(events: AffirmEvent[]): AffirmPlan {
  const byDeposit = new Map<string, AffirmDeposit>();
  for (const e of events) {
    const d = byDeposit.get(e.depositId) ?? {
      depositId: e.depositId,
      date: String(e.date).slice(0, 10),
      fees: 0,
      net: 0,
      events: 0,
    };
    // Amounts are CENTS; fees are negative in the API — flip to expense.
    d.fees += -e.feesCents / 100;
    d.net += e.totalSettledCents / 100;
    d.events += 1;
    // Keep the earliest event date as the deposit date.
    const ed = String(e.date).slice(0, 10);
    if (ed && ed < d.date) d.date = ed;
    byDeposit.set(e.depositId, d);
  }

  const deposits = Array.from(byDeposit.values())
    .map((d) => ({ ...d, fees: round2(d.fees), net: round2(d.net) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const feeBills: FeeBillPlan[] = [];
  const payoutJournals: TransferJournalPlan[] = [];
  for (const d of deposits) {
    if (Math.abs(d.fees) >= 0.01) {
      feeBills.push({
        gateway: 'affirm',
        periodKey: d.date,
        feeTotal: d.fees,
        transactionCount: d.events,
        memo: `Affirm processing fees · deposit ${d.date} (${d.depositId})`,
      });
    }
    if (Math.abs(d.net) >= 0.01) {
      payoutJournals.push({
        gateway: 'affirm',
        date: d.date,
        amount: d.net,
        reference: d.depositId,
        memo: `Affirm payout ${d.date} (${d.depositId})`,
      });
    }
  }
  return { deposits, feeBills, payoutJournals };
}
