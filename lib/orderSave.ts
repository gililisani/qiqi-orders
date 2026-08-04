/**
 * Server-side order money computation — the WRITE-side counterpart of
 * lib/orderPricing.ts (which VALIDATES stored rows before NetSuite/Stripe).
 *
 * /api/orders/save accepts only product ids + quantities from the browser
 * and computes every money field here: unit prices from the catalog by
 * company class, line totals, credit_earned, support_fund_used,
 * total_value. The math must stay identical to validateOrderPricing —
 * the push-so gate re-checks these same numbers later and a drift between
 * the two would 409 every order.
 */

import { resolveCatalogPrice } from './orderPricing';

/** How the warehouse packs the order — mandatory on every form save.
 *  Single source for the form dropdowns, client validation, the API check
 *  and the DB CHECK constraint (migration 20260803240000). */
export const PACKING_FOR_OPTIONS = ['Air Shipping', 'Ocean Shipping'] as const;
export type PackingFor = (typeof PACKING_FOR_OPTIONS)[number];

export interface SaveItemInput {
  product_id: number;
  quantity: number;
  case_qty?: number | null;
  is_support_fund_item: boolean;
}

export interface CatalogProduct {
  id: number;
  sku: string | null;
  price_americas: number | string | null;
  price_international: number | string | null;
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
  sort_order: number;
}

export interface OrderMoney {
  items: PricedItem[];
  total_value: number;
  credit_earned: number;
  support_fund_used: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Price every line from the catalog and derive the order totals.
 * Throws with a readable message on bad input (unknown/disabled product,
 * non-positive quantity).
 */
export function computeOrderMoney(args: {
  items: SaveItemInput[];
  productsById: Map<number, CatalogProduct>;
  companyClassName: string | null | undefined;
  /** Company's support-fund tier percent; 0 / null when not enrolled. */
  supportFundPercent: number | null | undefined;
}): OrderMoney {
  const pct = Number(args.supportFundPercent) || 0;

  let regularSubtotal = 0;
  let creditEarningSubtotal = 0;
  let sfSubtotal = 0;

  const priced: PricedItem[] = args.items.map((item, index) => {
    const product = args.productsById.get(item.product_id);
    if (!product) {
      throw new Error(`Unknown product id ${item.product_id}.`);
    }
    if (product.enable === false) {
      throw new Error(`${product.sku ?? `Product ${item.product_id}`} is not available.`);
    }
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(
        `${product.sku ?? `Product ${item.product_id}`}: quantity must be a positive whole number.`,
      );
    }

    const unitPrice = resolveCatalogPrice(args.companyClassName, product);
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
