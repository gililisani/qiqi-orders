/**
 * Server-side order money computation — the WRITE-side counterpart of
 * lib/orderPricing.ts (which VALIDATES stored rows before NetSuite/Stripe).
 *
 * /api/orders/save accepts only product ids + quantities from the browser
 * and computes every money field here: unit prices from the catalog by the
 * company's pricing tier, line totals, credit_earned, support_fund_used,
 * total_value. The math must stay identical to validateOrderPricing —
 * the push-so gate re-checks these same numbers later and a drift between
 * the two would 409 every order.
 *
 * The one non-catalog price is an admin's manual line price
 * (`unit_price_override`). The ROUTE decides which overrides are trusted
 * (an admin's payload, or the overrides already stored on the order) —
 * this module only applies what it is given.
 */

import { resolveUnitPrice, effectivePriceTier, PRICE_TIER_LABELS } from './orderPricing';

export interface SaveItemInput {
  product_id: number;
  quantity: number;
  case_qty?: number | null;
  is_support_fund_item: boolean;
  /** Manual unit price (admin-set). null/undefined = catalog tier price. */
  unit_price_override?: number | null;
}

export interface CatalogProduct {
  id: number;
  sku: string | null;
  price_americas: number | string | null;
  price_international: number | string | null;
  salon_price?: number | string | null;
  msrp?: number | string | null;
  qualifies_for_credit_earning: boolean | null;
  enable: boolean | null;
}

export interface PricedItem {
  product_id: number;
  quantity: number;
  case_qty: number;
  unit_price: number;
  total_price: number;
  is_support_fund_item: boolean;
  price_override: boolean;
  sort_order: number;
}

export interface OrderMoney {
  items: PricedItem[];
  total_value: number;
  credit_earned: number;
  support_fund_used: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Upper bound for a manual unit price — catches a mistyped extra digit
 *  long before it reaches a NetSuite SO. */
export const MAX_MANUAL_UNIT_PRICE = 100000;

/**
 * Parse a manual price from untrusted input. Returns null for "no override"
 * (absent/empty), the rounded price when valid, and throws when present but
 * invalid — a bad manual price must never silently fall back to the catalog.
 */
export function parseManualPrice(raw: unknown, label: string): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_MANUAL_UNIT_PRICE) {
    throw new Error(`${label}: manual price must be a number between 0 and ${MAX_MANUAL_UNIT_PRICE}.`);
  }
  return round2(n);
}

/**
 * Price every line and derive the order totals.
 * Throws with a readable message on bad input (unknown/disabled product,
 * non-positive quantity, no catalog price at the company's tier).
 */
export function computeOrderMoney(args: {
  items: SaveItemInput[];
  productsById: Map<number, CatalogProduct>;
  companyClassName: string | null | undefined;
  /** companies.price_tier (null = automatic from the class). */
  companyPriceTier?: string | null;
  /** Company's support-fund tier percent; 0 / null when not enrolled. */
  supportFundPercent: number | null | undefined;
}): OrderMoney {
  const pct = Number(args.supportFundPercent) || 0;
  const pricing = { priceTier: args.companyPriceTier, className: args.companyClassName };

  let regularSubtotal = 0;
  let creditEarningSubtotal = 0;
  let sfSubtotal = 0;

  const priced: PricedItem[] = args.items.map((item, index) => {
    const product = args.productsById.get(item.product_id);
    if (!product) {
      throw new Error(`Unknown product id ${item.product_id}.`);
    }
    const label = product.sku ?? `Product ${item.product_id}`;
    if (product.enable === false) {
      throw new Error(`${label} is not available.`);
    }
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`${label}: quantity must be a positive whole number.`);
    }

    const manual = parseManualPrice(item.unit_price_override, label);
    let unitPrice: number;
    if (manual !== null) {
      unitPrice = manual;
    } else {
      const catalog = resolveUnitPrice(pricing, product);
      if (catalog === null) {
        const tier = PRICE_TIER_LABELS[effectivePriceTier(pricing)];
        throw new Error(`${label} has no ${tier} price in the catalog, so it can't be ordered at that tier.`);
      }
      unitPrice = catalog;
    }
    const totalPrice = round2(quantity * unitPrice);

    if (item.is_support_fund_item) {
      sfSubtotal += totalPrice;
    } else {
      regularSubtotal += totalPrice;
      if (product.qualifies_for_credit_earning) {
        creditEarningSubtotal += totalPrice;
      }
    }

    return {
      product_id: item.product_id,
      quantity,
      case_qty: Number(item.case_qty) || 0,
      unit_price: unitPrice,
      total_price: totalPrice,
      is_support_fund_item: !!item.is_support_fund_item,
      price_override: manual !== null,
      sort_order: index,
    };
  });

  const earned = round2(creditEarningSubtotal * (pct / 100));
  const used = round2(Math.min(sfSubtotal, earned));
  const total = round2(regularSubtotal + Math.max(0, sfSubtotal - earned));

  return {
    items: priced,
    total_value: total,
    credit_earned: earned,
    support_fund_used: used,
  };
}

/** Key for matching an order line across saves (a product can appear once
 *  as a regular line and once as a support-fund line). */
export function lineKey(productId: number | string, isSupportFundItem: boolean | null | undefined): string {
  return `${Number(productId)}:${isSupportFundItem ? 'sf' : 'reg'}`;
}
