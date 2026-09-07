/**
 * PayPal / Affirm settlement automation — account + vendor wiring.
 *
 * Owner-approved design (2026-09-07):
 *  - PayPal: ONE vendor bill per MONTH for processing fees (fees are
 *    per-transaction in PayPal's ledger, but booking is aggregated to match
 *    the monthly statement), plus ONE journal per actual withdrawal to the
 *    bank, dated on the withdrawal INITIATION date (bank-rec matches the
 *    deposit 3-4 days later by amount — same as Shopify payout booking).
 *  - Affirm: per-payout, mirroring Shopify Loop E — vendor bill for the
 *    payout's fees + journal clearing → bank on the payout date.
 *
 * SHADOW FIRST: nothing writes to NetSuite until the 2026 analysis has been
 * reviewed against NS and signed off by the owner.
 *
 * Internal ids verified against production NetSuite 2026-09-07.
 */

export const SETTLEMENT_CONFIG = {
  paypal: {
    vendorId: '193097', // V5346 PayPal Inc.
    clearingAccountId: '1021', // 100504 PayPal QIQI INC (USD)
    feeExpenseAccountId: '1858', // 622060 PayPal Processing Fee
  },
  affirm: {
    vendorId: '193098', // V5347 Affirm Inc.
    clearingAccountId: '1026', // 100503 Affirm — QIQI INC (USD)
    feeExpenseAccountId: '2381', // 710130 Affirm Processing Fee
  },
  bankAccountId: '938', // 100101 IDB QIQINC (USD) — same bank as Shopify payouts
} as const;
