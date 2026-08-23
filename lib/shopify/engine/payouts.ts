/**
 * L3 ENGINE — Loop E: one payout → fee Vendor Bill (+ payment against
 * 100501) + net journal (bank ← 100501). CFO's pattern (= the HUB's
 * Amazon FBA flow), per payout so every bank line reconciles 1:1.
 *
 * Journal legs per payout:
 *   debit  100101 bank          net            (credit when net < 0)
 *   debit  240502 marketplace   taxAdj         (Shop-remitted tax deducted)
 *   credit 100501 clearing      net + taxAdj
 * Fees leave 100501 separately via the bill payment. Charges/refunds/
 * Shop Cash legs already exist as per-order payments and customer refunds
 * — after this journal the payout's slice of 100501 nets to zero.
 *
 * Disputes: money impact rides inside net, but booking the offset needs
 * the chargeback account — payouts containing disputes PARK until the
 * CPA names it (config.payouts.chargebackAccountId).
 */
import { centsToDecimal } from '../core/money';
import { buildPayoutPlan } from '../core/payoutTransform';
import type { ShopifyBalanceTxn, ShopifyPayoutNode, PayoutPlan } from '../core/payoutTransform';
import { PipelineError, type NsApi } from './pipeline';
import type { EngineConfig } from './config';

export interface PayoutBookingResult {
  plan: PayoutPlan;
  nsFeeBillId: string | null;
  nsFeePaymentId: string | null;
  nsJournalId: string;
  created: { bill: boolean; payment: boolean; journal: boolean };
}

export async function ensurePayoutBooking(
  payout: ShopifyPayoutNode,
  txns: ShopifyBalanceTxn[],
  ns: NsApi,
  config: EngineConfig,
): Promise<PayoutBookingResult> {
  const { plan, issues } = buildPayoutPlan(payout, txns);
  if (issues.length > 0) {
    throw new PipelineError(issues[0]);
  }
  const cfg = config.payouts;
  const created = { bill: false, payment: false, journal: false };

  if (plan.disputes.length > 0 && !cfg.chargebackAccountId) {
    throw new PipelineError({
      code: 'UNSUPPORTED_SOURCE',
      message: `payout ${plan.shopifyPayoutId}: contains ${plan.disputes.length} dispute(s) but no chargeback account is configured (CPA decision pending)`,
    });
  }

  const tranDate = plan.issuedAt.slice(0, 10);

  // ---- fee Vendor Bill + payment from 100501 ----
  let nsFeeBillId: string | null = null;
  let nsFeePaymentId: string | null = null;
  if (plan.totalFeeCents > 0) {
    const billExtId = `SHOPPO-FEE-${plan.shopifyPayoutId}`;
    nsFeeBillId = await ns.findRecordIdByExternalId('vendorBill', billExtId);
    if (!nsFeeBillId) {
      nsFeeBillId = await ns.createRecord('vendorBill', {
        externalId: billExtId,
        // Vendor reference is mandatory on this account (Amazon precedent).
        tranId: billExtId,
        entity: { id: cfg.shopifyVendorId },
        subsidiary: { id: config.subsidiaryId },
        currency: { id: '1' },
        tranDate,
        memo: `Shopify payout ${plan.shopifyPayoutId} fees`,
        expense: {
          items: plan.feeLines.map((l) => ({
            account: { id: cfg.feeExpenseAccountId },
            amount: Number(centsToDecimal(l.amountCents)),
            memo: l.label,
          })),
        },
      });
      created.bill = true;
    }
    const payExtId = `SHOPPO-FEEPAY-${plan.shopifyPayoutId}`;
    nsFeePaymentId = await ns.findRecordIdByExternalId('vendorPayment', payExtId);
    if (!nsFeePaymentId) {
      nsFeePaymentId = await ns.transformRecord('vendorBill', nsFeeBillId, 'vendorPayment', {
        externalId: payExtId,
        tranId: payExtId, // bare check numbers are unfindable (Amazon precedent)
        tranDate,
        account: { id: config.gatewayAccounts.shopify_payments },
        memo: `Shopify payout ${plan.shopifyPayoutId} fees payment`,
      });
      created.payment = true;
    }
  }

  // ---- net journal: bank ← clearing (+ pass-through clearing legs) ----
  // GROSS for the pass-through legs: their fees are already in the fee
  // vendor bill (FEE_LABELS covers dispute fees), so using net here would
  // count a dispute fee twice and leave 100501 off by it (found 2026-08-23
  // while building the 100501 statement; hidden so far because the Aug 10
  // payout's dispute fees cancelled out).
  const taxAdjCents = -plan.breakdown
    .filter((b) => b.type.startsWith('TAX_ADJUSTMENT'))
    .reduce((s, b) => s + b.grossCents, 0); // deductions are negative → positive debit
  const disputeCents = -plan.breakdown
    .filter((b) => b.type.startsWith('DISPUTE'))
    .reduce((s, b) => s + b.grossCents, 0); // withdrawal → positive debit (0 if none)

  // Signed legs; positive = debit, negative = credit. Must sum to zero.
  // The 100501 side is split into the same pieces the Shopify statement
  // shows (payout net / marketplace tax / disputes) so Match Bank Data
  // pairs every statement line with exactly one journal line.
  const legs: Array<{ account: string; cents: number; memo: string }> = [
    { account: cfg.bankAccountId, cents: plan.netCents, memo: 'Payout net to bank' },
    { account: config.gatewayAccounts.shopify_payments, cents: -plan.netCents, memo: `Clear Shopify balance · payout ${plan.shopifyPayoutId} net` },
  ];
  if (taxAdjCents !== 0) {
    legs.push({ account: cfg.marketplaceTaxAccountId, cents: taxAdjCents, memo: 'Shop-remitted marketplace tax' });
    legs.push({ account: config.gatewayAccounts.shopify_payments, cents: -taxAdjCents, memo: `Clear Shopify balance · payout ${plan.shopifyPayoutId} marketplace tax` });
  }
  if (disputeCents !== 0 && cfg.chargebackAccountId) {
    legs.push({ account: cfg.chargebackAccountId, cents: disputeCents, memo: 'Chargebacks/disputes' });
    legs.push({ account: config.gatewayAccounts.shopify_payments, cents: -disputeCents, memo: `Clear Shopify balance · payout ${plan.shopifyPayoutId} disputes` });
  }

  const journalExtId = `SHOPPO-NET-${plan.shopifyPayoutId}`;
  let nsJournalId = await ns.findRecordIdByExternalId('journalEntry', journalExtId);
  if (!nsJournalId) {
    nsJournalId = await ns.createRecord('journalEntry', {
      externalId: journalExtId,
      subsidiary: { id: config.subsidiaryId },
      tranDate,
      memo: `Shopify payout ${plan.shopifyPayoutId} (${plan.issuedAt.slice(0, 10)})`,
      line: {
        items: legs
          .filter((l) => l.cents !== 0)
          .map((l) => ({
            account: { id: l.account },
            ...(l.cents > 0
              ? { debit: Number(centsToDecimal(l.cents)) }
              : { credit: Number(centsToDecimal(-l.cents)) }),
            memo: l.memo,
          })),
      },
    });
    created.journal = true;
  }

  return { plan, nsFeeBillId, nsFeePaymentId, nsJournalId, created };
}
