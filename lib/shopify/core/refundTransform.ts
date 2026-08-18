/**
 * Shopify refunds → RefundPlans (Loop C input). Pure.
 *
 * Owner's rules (2026-08-18, docs/SHOPIFY-SYNC.md):
 * - The credit memo mirrors the exact refunded lines, each tax line
 *   reversed with its line (never a lump).
 * - Restock ONLY when Shopify says so (`restocked: true` on the refund
 *   line); no-restock refunds create no inventory movement.
 * - The money goes back to the same clearing account the payment came
 *   from — one refund entry per gateway transaction (split-tender safe).
 * - Amount-only refunds (no line items — fixture #7084) and non-line
 *   residuals (refunded shipping — fixture #7083 refunds $30 line +
 *   $8.90 shipping) carry as `residualCents`, booked to the refund
 *   adjustment item/account (config).
 */
import { toCents } from './money';
import type { ShopifyOrder, SyncIssue } from './types';

export interface RefundPlanLine {
  sku: string | null;
  shopifyLineItemId: string;
  quantity: number;
  restock: boolean;
  subtotalCents: number;
  taxCents: number;
}

export interface RefundPlanTransaction {
  shopifyTransactionId: string;
  gateway: string;
  amountCents: number;
}

export interface RefundPlan {
  shopifyRefundId: string; // numeric
  shopifyOrderId: string; // numeric
  orderName: string;
  createdAt: string;
  note: string | null;
  lines: RefundPlanLine[];
  /** Refund money not attributable to product lines: shipping, manual amounts. */
  residualCents: number;
  /** Money movements back to the customer, per gateway. */
  transactions: RefundPlanTransaction[];
  totalCents: number;
}

export interface RefundTransformResult {
  plans: RefundPlan[];
  issues: SyncIssue[];
}

const gidNum = (gid: string) => gid.replace(/^.*\//, '');

export function buildRefundPlans(order: ShopifyOrder): RefundTransformResult {
  const issues: SyncIssue[] = [];
  const plans: RefundPlan[] = [];

  for (const refund of order.refunds) {
    const totalCents = toCents(refund.totalRefundedSet.shopMoney.amount);

    const lines: RefundPlanLine[] = refund.refundLineItems.nodes.map((rl) => ({
      sku: rl.lineItem.sku,
      shopifyLineItemId: gidNum(rl.lineItem.id),
      quantity: rl.quantity,
      restock: rl.restocked === true,
      subtotalCents: toCents(rl.subtotalSet.shopMoney.amount),
      taxCents: toCents(rl.totalTaxSet.shopMoney.amount),
    }));

    const transactions: RefundPlanTransaction[] = refund.transactions.nodes
      .filter((t) => t.kind === 'REFUND' && t.status === 'SUCCESS')
      .map((t) => ({
        shopifyTransactionId: gidNum(t.id),
        gateway: t.gateway,
        amountCents: toCents(t.amountSet.shopMoney.amount),
      }));

    const linesTotal = lines.reduce((s, l) => s + l.subtotalCents + l.taxCents, 0);
    const residualCents = totalCents - linesTotal;
    if (residualCents < 0) {
      issues.push({
        code: 'TOTALS_MISMATCH',
        message: `${order.name} refund ${gidNum(refund.id)}: line total ${linesTotal} exceeds refund total ${totalCents} (cents)`,
      });
    }

    // The money that moved must equal the refund's total. A refund with
    // no successful transaction exists (e.g. store-credit only) — flag it
    // rather than guess; those need a human decision on booking.
    const moved = transactions.reduce((s, t) => s + t.amountCents, 0);
    if (moved !== totalCents) {
      issues.push({
        code: 'PAYMENT_MISMATCH',
        message: `${order.name} refund ${gidNum(refund.id)}: transactions ${moved} != refund total ${totalCents} (cents)`,
      });
    }

    plans.push({
      shopifyRefundId: gidNum(refund.id),
      shopifyOrderId: gidNum(order.id),
      orderName: order.name,
      createdAt: refund.createdAt,
      note: refund.note,
      lines,
      residualCents: Math.max(residualCents, 0),
      transactions,
      totalCents,
    });
  }

  return { plans, issues };
}
