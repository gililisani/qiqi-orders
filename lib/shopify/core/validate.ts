/**
 * Validation gates — principle 3: loud failure, never silently guess.
 *
 * Pure: takes the order (+ the known-SKU set the engine loaded) and returns
 * proceed / skip / error. Every money field is re-parsed and re-added here;
 * an order whose numbers don't reconcile to the cent goes to the error
 * queue, not to NetSuite.
 */
import { toCents } from './money';
import type { GateResult, ShopifyOrder, SyncIssue } from './types';

const USD = 'USD';

export function gateOrder(order: ShopifyOrder, knownSkus: ReadonlySet<string>): GateResult {
  // --- skips (not errors) ---
  if (order.test) {
    return { outcome: 'skip', reason: 'TEST_ORDER', message: `${order.name} is a Shopify test order` };
  }
  const paidStatuses = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];
  if (!paidStatuses.includes(order.displayFinancialStatus)) {
    // Pay-upfront store: anything not yet paid is simply "not ready" —
    // the poller will pick it up once payment lands (Affirm can lag).
    // A cancelled never-paid order will terminally park here.
    const reason = order.cancelledAt ? 'CANCELLED_UNPAID' : 'UNPAID_YET';
    return {
      outcome: 'skip',
      reason,
      message: `${order.name} financial status ${order.displayFinancialStatus}`,
    };
  }

  const issues: SyncIssue[] = [];

  // --- currency: the EUR incident must be impossible to repeat ---
  const money = (bag: { shopMoney: { amount: string; currencyCode?: string } } | null | undefined, label: string): number => {
    if (!bag?.shopMoney) {
      issues.push({ code: 'UNPARSEABLE_MONEY', message: `${label} missing on ${order.name}` });
      return 0;
    }
    const cc = bag.shopMoney.currencyCode;
    if (cc && cc !== USD) {
      issues.push({ code: 'NOT_USD', message: `${label} on ${order.name} is ${cc}, not USD` });
    }
    try {
      return toCents(bag.shopMoney.amount);
    } catch {
      issues.push({ code: 'UNPARSEABLE_MONEY', message: `${label} on ${order.name}: ${JSON.stringify(bag.shopMoney.amount)}` });
      return 0;
    }
  };

  if (order.currencyCode !== USD) {
    issues.push({ code: 'NOT_USD', message: `${order.name} order currency is ${order.currencyCode}` });
  }
  if (order.presentmentCurrencyCode && order.presentmentCurrencyCode !== USD) {
    issues.push({ code: 'NOT_USD', message: `${order.name} presentment currency is ${order.presentmentCurrencyCode}` });
  }
  for (const t of order.transactions) {
    const cc = t.amountSet?.shopMoney?.currencyCode;
    if (cc && cc !== USD) {
      issues.push({ code: 'NOT_USD', message: `${order.name} transaction ${t.id} in ${cc}` });
    }
  }

  // --- taxes-included pricing would break our line math; the store is
  //     tax-exclusive today, so flag if that ever flips ---
  if (order.taxesIncluded) {
    issues.push({ code: 'TAXES_INCLUDED', message: `${order.name} has taxesIncluded=true (store was tax-exclusive)` });
  }

  // --- lines: every active line needs a known SKU ---
  const activeLines = order.lineItems.nodes.filter((li) => li.currentQuantity > 0 || li.quantity > 0);
  if (activeLines.length === 0) {
    issues.push({ code: 'NO_LINES', message: `${order.name} has no line items` });
  }
  for (const li of activeLines) {
    if (li.isGiftCard) {
      issues.push({ code: 'GIFT_CARD_LINE', message: `${order.name} line "${li.name}" is a gift card (unsupported)` });
      continue;
    }
    const sku = li.sku ?? li.variant?.sku ?? null;
    if (!sku) {
      issues.push({ code: 'MISSING_SKU', message: `${order.name} line "${li.name}" has no SKU`, detail: { lineItemId: li.id } });
    } else if (!knownSkus.has(sku)) {
      issues.push({ code: 'UNKNOWN_SKU', message: `${order.name} SKU "${sku}" not found in NetSuite item map`, detail: { sku } });
    }
  }

  // --- totals must reconcile to the cent (current* = post-edit state) ---
  const subtotal = money(order.currentSubtotalPriceSet, 'subtotal');
  const tax = money(order.currentTotalTaxSet, 'tax');
  const shipping = money(order.currentShippingPriceSet, 'shipping');
  const total = money(order.currentTotalPriceSet, 'total');
  const computed = subtotal + tax + shipping;
  if (computed !== total) {
    issues.push({
      code: 'TOTALS_MISMATCH',
      message: `${order.name} subtotal+tax+shipping=${computed} but total=${total} (cents)`,
      detail: { subtotal, tax, shipping, total },
    });
  }

  // Line-level cross-check, exact to the cent with no unit-price rounding:
  // current charged per line = originalTotal − discount allocations −
  // refunded line subtotals. (discountedTotalSet excludes order-level code
  // discounts and ignores refunds — learned from fixtures #7220/#7083.)
  const refundedByLine = new Map<string, number>();
  for (const r of order.refunds) {
    for (const rl of r.refundLineItems.nodes) {
      refundedByLine.set(
        rl.lineItem.id,
        (refundedByLine.get(rl.lineItem.id) ?? 0) + money(rl.subtotalSet, `refund line ${rl.lineItem.sku}`),
      );
    }
  }
  const lineSum = activeLines
    .filter((li) => !li.isGiftCard)
    .reduce((sum, li) => {
      const allocs = li.discountAllocations.reduce((s, a) => s + money(a.allocatedAmountSet, `alloc ${li.sku}`), 0);
      return sum + money(li.originalTotalSet, `line ${li.sku}`) - allocs - (refundedByLine.get(li.id) ?? 0);
    }, 0);
  if (activeLines.length > 0 && lineSum !== subtotal) {
    issues.push({
      code: 'TOTALS_MISMATCH',
      message: `${order.name} line totals sum ${lineSum} != subtotal ${subtotal} (cents)`,
      detail: { lineSum, subtotal },
    });
  }

  // --- payments: successful sales/captures must cover the charged total.
  //     (Refund transactions are Loop C's business, checked separately.) ---
  const paidCents = order.transactions
    .filter((t) => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS')
    .reduce((sum, t) => sum + money(t.amountSet, `txn ${t.id}`), 0);
  // A CAPTURE follows its AUTHORIZATION; both appear but only capture moves money.
  const originalTotal = money(order.currentTotalPriceSet, 'total') + money(order.totalRefundedSet, 'refunded');
  if (paidCents !== originalTotal) {
    issues.push({
      code: 'PAYMENT_MISMATCH',
      message: `${order.name} successful payments ${paidCents} != charged total ${originalTotal} (cents)`,
      detail: { paidCents, originalTotal },
    });
  }

  if (issues.length > 0) return { outcome: 'error', issues };
  if (total === 0 && paidCents === 0) {
    return { outcome: 'skip', reason: 'ZERO_TOTAL', message: `${order.name} is a zero-value order` };
  }
  return { outcome: 'proceed' };
}
