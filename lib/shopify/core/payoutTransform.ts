/**
 * Shopify Payments payout + its balance transactions → PayoutPlan (Loop E
 * input). Pure.
 *
 * CFO's flow (docs/SHOPIFY-SYNC.md): per payout, a Vendor Bill to vendor
 * "Shopify" for the fees (622070) paid by journal against 100501, plus a
 * net journal (100501 → bank/transit) matching the bank line exactly.
 * Negative payouts (refund-heavy days — real: −$29.90 on 2026-08-12) are
 * withdrawals: same journals, opposite direction.
 *
 * Validation leans on the API's own invariant: a payout's balance
 * transactions include its TRANSFER (= −net), so everything-else must sum
 * to exactly net. Any drift → issue, never a booked guess.
 */
import { toCents } from './money';
import type { SyncIssue } from './types';

export interface ShopifyPayoutSummary {
  adjustmentsFee: { amount: string };
  adjustmentsGross: { amount: string };
  chargesFee: { amount: string };
  chargesGross: { amount: string };
  refundsFee: { amount: string };
  refundsFeeGross: { amount: string };
  reservedFundsFee: { amount: string };
  reservedFundsGross: { amount: string };
  retriedPayoutsFee: { amount: string };
  retriedPayoutsGross: { amount: string };
}

export interface ShopifyPayoutNode {
  id: string;
  legacyResourceId: string;
  issuedAt: string;
  status: string;
  net: { amount: string; currencyCode?: string };
  summary: ShopifyPayoutSummary;
}

export interface ShopifyBalanceTxn {
  id: string;
  transactionDate: string;
  type: string; // CHARGE | REFUND | TRANSFER | DISPUTE_WITHDRAWAL | DISPUTE_REVERSAL | SHOP_CASH_CREDIT | TAX_ADJUSTMENT_DEBIT | ...
  test: boolean;
  amount: { amount: string };
  fee: { amount: string };
  net: { amount: string };
  sourceId: string | null;
  sourceType: string | null;
  adjustmentReason: string | null;
  associatedOrder: { id: string; name: string } | null;
  associatedPayout: { id: string } | null;
}

export interface PayoutTypeBreakdown {
  type: string;
  count: number;
  grossCents: number;
  feeCents: number;
  netCents: number;
}

export interface PayoutPlan {
  shopifyPayoutId: string;
  issuedAt: string;
  status: string;
  /** Positive = deposit into the bank; negative = Shopify withdraws. */
  netCents: number;
  totalFeeCents: number;
  /** Fee bill lines for vendor "Shopify" → 622070, labeled by origin. */
  feeLines: Array<{ label: string; amountCents: number }>;
  breakdown: PayoutTypeBreakdown[];
  /** Orders whose money moved in this payout (admin drill-down + recon). */
  orders: Array<{ orderName: string; type: string; netCents: number }>;
  /** Chargebacks surfaced by this payout — alert fodder. */
  disputes: Array<{ orderName: string | null; type: string; netCents: number }>;
}

export interface PayoutTransformResult {
  plan: PayoutPlan;
  issues: SyncIssue[];
}

export function buildPayoutPlan(payout: ShopifyPayoutNode, txns: ShopifyBalanceTxn[]): PayoutTransformResult {
  const issues: SyncIssue[] = [];
  const netCents = toCents(payout.net.amount);

  if (payout.net.currencyCode && payout.net.currencyCode !== 'USD') {
    issues.push({ code: 'NOT_USD', message: `payout ${payout.legacyResourceId} in ${payout.net.currencyCode}` });
  }

  const composition = txns.filter((t) => t.type !== 'TRANSFER');
  const transfer = txns.find((t) => t.type === 'TRANSFER');

  const byType = new Map<string, PayoutTypeBreakdown>();
  let totalFeeCents = 0;
  for (const t of composition) {
    const row = byType.get(t.type) ?? { type: t.type, count: 0, grossCents: 0, feeCents: 0, netCents: 0 };
    row.count += 1;
    row.grossCents += toCents(t.amount.amount);
    row.feeCents += toCents(t.fee.amount);
    row.netCents += toCents(t.net.amount);
    byType.set(t.type, row);
    totalFeeCents += toCents(t.fee.amount);
  }

  // Invariant: composition nets must sum to the payout net.
  const compositionNet = composition.reduce((s, t) => s + toCents(t.net.amount), 0);
  if (txns.length > 0 && compositionNet !== netCents) {
    issues.push({
      code: 'TOTALS_MISMATCH',
      message: `payout ${payout.legacyResourceId}: composition nets ${compositionNet} != payout net ${netCents} (cents)`,
    });
  }
  if (transfer && toCents(transfer.net.amount) !== -netCents) {
    issues.push({
      code: 'TOTALS_MISMATCH',
      message: `payout ${payout.legacyResourceId}: TRANSFER ${transfer.net.amount} != -net`,
    });
  }

  const FEE_LABELS: Record<string, string> = {
    CHARGE: 'Processing fees',
    REFUND: 'Refund fees',
    DISPUTE_WITHDRAWAL: 'Dispute fees',
    DISPUTE_REVERSAL: 'Dispute reversal fees',
  };
  const feeLines = [...byType.values()]
    .filter((r) => r.feeCents !== 0)
    .map((r) => ({ label: FEE_LABELS[r.type] ?? `${r.type} fees`, amountCents: r.feeCents }));

  const plan: PayoutPlan = {
    shopifyPayoutId: payout.legacyResourceId,
    issuedAt: payout.issuedAt,
    status: payout.status,
    netCents,
    totalFeeCents,
    feeLines,
    breakdown: [...byType.values()].sort((a, b) => b.count - a.count),
    orders: composition
      .filter((t) => t.associatedOrder)
      .map((t) => ({ orderName: t.associatedOrder!.name, type: t.type, netCents: toCents(t.net.amount) })),
    disputes: composition
      .filter((t) => t.type === 'DISPUTE_WITHDRAWAL' || t.type === 'DISPUTE_REVERSAL')
      .map((t) => ({ orderName: t.associatedOrder?.name ?? null, type: t.type, netCents: toCents(t.net.amount) })),
  };

  return { plan, issues };
}
