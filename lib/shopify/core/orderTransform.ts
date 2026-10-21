/**
 * Shopify order → OrderPlan (Loop A input). Pure; assumes gateOrder passed.
 *
 * Principle 1: the plan records exactly what the customer was charged —
 * actual line amounts, every distinct tax jurisdiction verbatim, shipping
 * as charged. NS representation (which tax item a jurisdiction maps to,
 * how discounts render on the SO) is the engine's config-driven concern.
 */
import { toCents } from './money';
import { extractBuyer } from './customerMatch';
import type { OrderPlan, PlanTaxLine, ShopifyOrder, ShopifyTaxLine } from './types';

function planTaxLines(lines: ShopifyTaxLine[]): PlanTaxLine[] {
  return lines
    .map((t) => ({
      title: t.title,
      ratePercentage: t.ratePercentage ?? (typeof t.rate === 'number' ? t.rate * 100 : null),
      amountCents: toCents(t.priceSet.shopMoney.amount),
      channelLiable: t.channelLiable === true,
    }))
    .filter((t) => t.amountCents !== 0);
}

function gidNum(gid: string): string {
  const m = /\/(\d+)$/.exec(gid);
  return m ? m[1] : gid;
}

export function buildOrderPlan(order: ShopifyOrder): OrderPlan {
  const buyer = extractBuyer(order);

  // Lines are AS-SOLD (original quantities, charged prices) — the SO and
  // Invoice book the sale as it happened; refunds are Loop C's credit
  // memos, never a mutation of the sale. Exact net with no unit rounding:
  // originalTotal − discount allocations (discountedTotalSet excludes
  // order-level code discounts — fixture #7220).
  const lines = order.lineItems.nodes
    .filter((li) => li.quantity > 0 && !li.isGiftCard)
    .map((li) => {
      const discountCents = li.discountAllocations.reduce(
        (s, a) => s + toCents(a.allocatedAmountSet.shopMoney.amount),
        0,
      );
      return {
        shopifyLineItemId: gidNum(li.id),
        sku: (li.sku ?? li.variant?.sku)!,
        description: li.name,
        quantity: li.quantity,
        originalUnitPriceCents: toCents(li.originalUnitPriceSet.shopMoney.amount),
        netAmountCents: toCents(li.originalTotalSet.shopMoney.amount) - discountCents,
        discountCents,
        taxLines: planTaxLines(li.taxLines),
      };
    });

  // Shipping: sum shipping lines as charged (post-discount); keep the first
  // title for the NS shipping method description.
  const shipNodes = order.shippingLines.nodes;
  const shippingCents = shipNodes.reduce((s, n) => s + toCents(n.discountedPriceSet.shopMoney.amount), 0);
  const shipping =
    shipNodes.length > 0
      ? {
          title: shipNodes.map((n) => n.title).join(', '),
          amountCents: shippingCents,
          taxLines: planTaxLines(shipNodes.flatMap((n) => n.taxLines)),
        }
      : null;

  // Payments: successful money-moving transactions only. Split tender
  // (#7201: shop_cash + shopify_payments) yields multiple entries.
  const payments = order.transactions
    .filter((t) => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS')
    .map((t) => ({
      shopifyTransactionId: gidNum(t.id),
      gateway: t.gateway,
      amountCents: toCents(t.amountSet.shopMoney.amount),
      processedAt: t.processedAt,
      feeCents:
        t.fees && t.fees.length > 0
          ? t.fees.reduce((s, f) => s + toCents(f.amount.amount), 0)
          : null,
    }));

  // Discount names for the NS memo: only discounts that actually took money
  // off an item or the shipping, each name once. The site lists a 0%
  // "Free Gift" automatic discount on every checkout (81 orders, Oct 2026,
  // memo said "discount: Free Gift" with no gift). Judged by allocations,
  // not by the stated value — function discounts can state $0 and still
  // allocate. Orders without application indexes (older fixtures) keep
  // every name, as before.
  const allocated = new Map<number, number>();
  let indexed = order.discountApplications.nodes.length > 0;
  const allocations = [
    ...order.lineItems.nodes.flatMap((li) => li.discountAllocations),
    ...order.shippingLines.nodes.flatMap((s) => s.discountAllocations ?? []),
  ];
  for (const a of allocations) {
    const idx = a.discountApplication?.index;
    if (typeof idx !== 'number') {
      indexed = false;
      continue;
    }
    allocated.set(idx, (allocated.get(idx) ?? 0) + toCents(a.allocatedAmountSet.shopMoney.amount));
  }
  if (order.discountApplications.nodes.some((d) => typeof d.index !== 'number')) indexed = false;
  const discountCodes = [
    ...new Set(
      order.discountApplications.nodes
        .filter((d) => !indexed || (allocated.get(d.index as number) ?? 0) > 0)
        .map((d) => (typeof d.code === 'string' ? d.code : typeof d.title === 'string' ? (d.title as string) : null))
        .filter((c): c is string => !!c),
    ),
  ];

  const dutiesCents = order.currentTotalDutiesSet ? toCents(order.currentTotalDutiesSet.shopMoney.amount) : 0;
  const taxLines = planTaxLines(order.taxLines);
  if (dutiesCents > 0) {
    // Import duties: merchant-liable pass-through (same DDP liability as
    // intl VAT — collected from the buyer, forwarded to the courier).
    taxLines.push({ title: 'Import Duties', ratePercentage: null, amountCents: dutiesCents, channelLiable: false });
  }

  // Presentment (EUR-window) orders: book USD; reconcile the USD actually
  // received against the USD as-sold math and carry the difference.
  const presentmentFx = !!order.presentmentCurrencyCode && order.presentmentCurrencyCode !== order.currencyCode;
  const saleTxn = order.transactions.find((t) => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS');
  const presentment = presentmentFx
    ? { currency: order.presentmentCurrencyCode!, amount: saleTxn?.amountSet?.presentmentMoney?.amount ?? '' }
    : null;
  const asSoldInvoiceCents =
    lines.reduce((s, l) => s + l.netAmountCents, 0) + shippingCents + taxLines.reduce((s, t) => s + t.amountCents, 0);
  const paidCents = payments.reduce((s, p) => s + p.amountCents, 0);
  const fxAdjustmentCents = presentmentFx && payments.length > 0 ? paidCents - asSoldInvoiceCents : 0;

  return {
    shopifyOrderId: gidNum(order.id),
    orderName: order.name,
    processedAt: order.processedAt,
    poNumber: order.poNumber,
    note: order.note,
    buyer,
    lines,
    taxLines,
    shipping,
    payments,
    presentment,
    fxAdjustmentCents,
    totals: {
      subtotalCents: toCents(order.currentSubtotalPriceSet.shopMoney.amount),
      discountCents: toCents(order.currentTotalDiscountsSet.shopMoney.amount),
      shippingCents: toCents(order.currentShippingPriceSet.shopMoney.amount),
      taxCents: toCents(order.currentTotalTaxSet.shopMoney.amount),
      dutiesCents,
      totalCents: toCents(order.currentTotalPriceSet.shopMoney.amount),
    },
    discountCodes,
  };
}

/** The NS sales order memo (the invoice inherits it when transformed from the SO). */
export function salesOrderMemo(plan: Pick<OrderPlan, 'orderName' | 'discountCodes' | 'presentment'>): string {
  return `Shopify ${plan.orderName}${plan.discountCodes.length ? ` · discount: ${plan.discountCodes.join(', ')}` : ''}${plan.presentment ? ` · presented in ${plan.presentment.currency} ${plan.presentment.amount}` : ''}`;
}
