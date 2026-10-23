/**
 * Order edits after booking — pure planning (2026-10-23, #7641).
 *
 * Staff swap an out-of-stock item by editing the paid order: remove it, add
 * another, usually with a line discount so the total stays the same. In
 * Shopify the removal is a "$0 refund" (removed lines, no money) and the
 * addition is a new line item. NetSuite mirror:
 *
 *   - added units   → new sales order lines, billed on an "edit invoice"
 *                     (discount + tax of the added lines carried over)
 *   - removed units → a credit memo for their value, no money back, applied
 *                     to the order's open invoice (engine/refund.ts)
 *   - units that will never ship → their SO lines are closed. This also
 *                     covers plain cancel-and-refund lines, which were never
 *                     closed before (#7383, #7424, #7589 sat "Pending
 *                     Fulfillment", holding stock as committed).
 *
 * Automatic only when the edit moved no money: as-sold total − payments −
 * removed value = 0, and no payment came after the first removal.
 * Anything else parks with ORDER_EDIT_NEEDS_REVIEW for a human.
 */
import type { OrderPlan, PlanTaxLine, ShopifyOrder } from './types';
import type { RefundPlan } from './refundTransform';

/** NS sales order line as the engine reads it (quantities positive). */
export interface SoLineState {
  lineId: number;
  itemId: string;
  /** NS item type; only stock items (InvtPart/Assembly/Kit) ship and get closed. Absent = stock item. */
  itemType?: string;
  quantity: number;
  quantityBilled: number;
  quantityFulfilled: number;
  isClosed: boolean;
}

/** A Shopify order line with what is still current after removals. */
export interface ShopifyLineState {
  shopifyLineItemId: string;
  sku: string;
  description: string;
  /** Units sold on this line, including any later removed (never decreases). */
  quantity: number;
  /** Units still on the order after removals. */
  currentQuantity: number;
  /** Charged amount for `quantity` units (catalog − discounts). */
  netAmountCents: number;
  discountCents: number;
  taxLines: PlanTaxLine[];
}

export function shopifyLineStates(order: ShopifyOrder, plan: OrderPlan): ShopifyLineState[] {
  const current = new Map(order.lineItems.nodes.map((li) => [li.id.replace(/^.*\//, ''), li.currentQuantity]));
  return plan.lines.map((l) => ({
    shopifyLineItemId: l.shopifyLineItemId,
    sku: l.sku,
    description: l.description,
    quantity: l.quantity,
    currentQuantity: current.get(l.shopifyLineItemId) ?? l.quantity,
    netAmountCents: l.netAmountCents,
    discountCents: l.discountCents,
    taxLines: l.taxLines,
  }));
}

/** The invoices' as-sold total: every sold line + shipping + tax/duties (+ FX rounding). */
export function asSoldCents(plan: OrderPlan): number {
  return (
    plan.lines.reduce((s, l) => s + l.netAmountCents, 0) +
    (plan.shipping?.amountCents ?? 0) +
    plan.taxLines.reduce((s, t) => s + t.amountCents, 0) +
    (plan.fxAdjustmentCents ?? 0)
  );
}

/** Value credited for removals: removed lines + their tax. */
export function removalCents(refunds: RefundPlan[]): number {
  return refunds
    .filter((r) => r.kind === 'removal')
    .reduce((s, r) => s + r.lines.reduce((t, l) => t + l.subtotalCents + l.taxCents, 0), 0);
}

/** NS item types that ship (and so can be fulfilled or closed). */
export const SHIPPING_TYPES = new Set(['InvtPart', 'Assembly', 'Kit']);

const share = (cents: number, part: number, whole: number) => (whole ? Math.round((cents * part) / whole) : 0);

export interface AddedLine {
  sku: string;
  itemId: string;
  shopifyLineItemId: string;
  description: string;
  quantity: number;
  /** Catalog amount for these units (the SO books catalog; discounts sit on the invoice header). */
  amountCents: number;
  discountCents: number;
  taxLines: PlanTaxLine[];
}

/**
 * Units Shopify sold that the sales order doesn't have yet (added by an
 * edit after booking). Per item, Shopify's sold quantity minus every SO
 * line's quantity (closed lines included — their units were booked);
 * the excess is taken from the newest Shopify lines.
 */
export function planAddedLines(
  lines: ShopifyLineState[],
  soLines: SoLineState[],
  itemIdBySku: Map<string, string>,
): AddedLine[] {
  const added: AddedLine[] = [];
  for (const sku of new Set(lines.map((l) => l.sku))) {
    const itemId = itemIdBySku.get(sku);
    if (!itemId) continue;
    const ofSku = lines.filter((l) => l.sku === sku);
    const sold = ofSku.reduce((s, l) => s + l.quantity, 0);
    const booked = soLines.filter((s) => s.itemId === itemId).reduce((s, l) => s + l.quantity, 0);
    let excess = sold - booked;
    for (const l of [...ofSku].reverse()) {
      if (excess <= 0) break;
      const take = Math.min(excess, l.quantity);
      excess -= take;
      added.push({
        sku,
        itemId,
        shopifyLineItemId: l.shopifyLineItemId,
        description: l.description,
        quantity: take,
        amountCents: share(l.netAmountCents + l.discountCents, take, l.quantity),
        discountCents: share(l.discountCents, take, l.quantity),
        taxLines: l.taxLines.map((t) => ({ ...t, amountCents: share(t.amountCents, take, l.quantity) })),
      });
    }
  }
  return added;
}

export interface EditInvoicePlan {
  lineIds: number[];
  discountCents: number;
  taxLines: PlanTaxLine[];
  /** What the edit invoice must total: catalog − discount + tax. */
  expectedCents: number;
}

/**
 * The edit invoice for SO lines not billed yet. Their discount and tax
 * come from the matching Shopify lines (newest first — added lines are
 * the newest). Null when nothing is left to bill.
 */
export function planEditInvoice(
  lines: ShopifyLineState[],
  soLines: SoLineState[],
  skuByItemId: Map<string, string>,
): EditInvoicePlan | null {
  const unbilled = soLines.filter((s) => !s.isClosed && s.quantity > s.quantityBilled);
  if (!unbilled.length) return null;
  let catalog = 0;
  let discount = 0;
  const tax = new Map<string, PlanTaxLine>();
  for (const s of unbilled) {
    const sku = skuByItemId.get(s.itemId);
    let units = s.quantity - s.quantityBilled;
    for (const l of lines.filter((x) => x.sku === sku).reverse()) {
      if (units <= 0) break;
      const take = Math.min(units, l.quantity);
      units -= take;
      catalog += share(l.netAmountCents + l.discountCents, take, l.quantity);
      discount += share(l.discountCents, take, l.quantity);
      for (const t of l.taxLines) {
        const key = `${t.title}|${t.channelLiable}`;
        const prev = tax.get(key);
        const amount = share(t.amountCents, take, l.quantity);
        tax.set(key, prev ? { ...prev, amountCents: prev.amountCents + amount } : { ...t, amountCents: amount });
      }
    }
  }
  const taxLines = [...tax.values()].filter((t) => t.amountCents !== 0);
  return {
    lineIds: unbilled.map((s) => s.lineId),
    discountCents: discount,
    taxLines,
    expectedCents: catalog - discount + taxLines.reduce((s, t) => s + t.amountCents, 0),
  };
}

/**
 * Whether an edit can be booked automatically. Null = nothing to do or
 * safe; a string = why a human must look.
 */
export function editNeedsReview(plan: OrderPlan, refunds: RefundPlan[], added: AddedLine[]): string | null {
  const removals = refunds.filter((r) => r.kind === 'removal');
  if (!removals.length && !added.length) return null;
  const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
  const paid = plan.payments.reduce((s, p) => s + p.amountCents, 0);
  const removed = removalCents(refunds);
  const owed = asSoldCents(plan) - paid - removed;
  if (owed !== 0) {
    return `${plan.orderName} was edited after it was booked and the edit changed what the customer owes (sold ${usd(asSoldCents(plan))}, paid ${usd(paid)}, removed ${usd(removed)} → ${owed > 0 ? `${usd(owed)} unpaid` : `${usd(-owed)} overpaid`}). Book the difference in NetSuite by hand, then Ignore.`;
  }
  const firstRemoval = removals.map((r) => r.createdAt).sort()[0];
  if (firstRemoval && plan.payments.some((p) => p.processedAt && p.processedAt > firstRemoval)) {
    return `${plan.orderName} was edited after it was booked and a payment was taken after the edit. Book it in NetSuite by hand, then Ignore.`;
  }
  return null;
}

/**
 * SO lines that will never ship: per item, NS open units (not closed,
 * not fulfilled) beyond what Shopify still expects to ship (current units
 * − shipped units). Whole lines only — NS can't close part of a line, so
 * a partial excess waits until the rest of that line ships.
 */
export function planLineClosures(
  lines: ShopifyLineState[],
  soLines: SoLineState[],
  shippedBySku: Map<string, number>,
  skuByItemId: Map<string, string>,
): number[] {
  const close: number[] = [];
  const ships = (s: SoLineState) => !s.itemType || SHIPPING_TYPES.has(s.itemType);
  soLines = soLines.filter(ships);
  for (const itemId of new Set(soLines.map((s) => s.itemId))) {
    const sku = skuByItemId.get(itemId);
    if (!sku) continue;
    const current = lines.filter((l) => l.sku === sku).reduce((s, l) => s + l.currentQuantity, 0);
    const stillToShip = Math.max(0, current - (shippedBySku.get(sku) ?? 0));
    const open = soLines
      .filter((s) => s.itemId === itemId && !s.isClosed && s.quantity > s.quantityFulfilled)
      .map((s) => ({ lineId: s.lineId, remaining: s.quantity - s.quantityFulfilled }));
    let excess = open.reduce((s, o) => s + o.remaining, 0) - stillToShip;
    for (const o of [...open].sort((a, b) => b.remaining - a.remaining)) {
      if (excess <= 0) break;
      if (o.remaining <= excess) {
        close.push(o.lineId);
        excess -= o.remaining;
      }
    }
  }
  return close.sort((a, b) => a - b);
}
