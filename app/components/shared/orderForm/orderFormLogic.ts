/**
 * Shared order-form logic — the single source for BOTH order forms
 * (AdminOrderFormView / ClientOrderFormView). They were forks carrying
 * character-identical copies of every function below (audit WP5.3); the
 * views now keep only state, fetching, and layout.
 *
 * Everything here is a pure function: inputs in, value out, no React.
 *
 * Pricing note: the region price rule is IMPORTED from lib/orderPricing —
 * the exact function the server uses to validate orders before they reach
 * NetSuite. Forms and validator cannot drift.
 */

import { resolveCatalogPrice } from '../../../../lib/orderPricing';

// Structural types — deliberately loose (`[k: string]: any`) so each view's
// richer local interfaces satisfy them without a big type unification.
export interface FormCategory {
  id: number;
  sort_order?: number | null;
  visible_to_americas?: boolean | null;
  visible_to_international?: boolean | null;
  [k: string]: any;
}

export interface FormProduct {
  id: number;
  case_pack?: number | null;
  price_americas?: number | null;
  price_international?: number | null;
  qualifies_for_credit_earning?: boolean | null;
  list_in_support_funds?: boolean | null;
  visible_to_americas?: boolean | null;
  visible_to_international?: boolean | null;
  category?: FormCategory | null;
  [k: string]: any;
}

export interface FormOrderItem {
  product_id: number;
  product: FormProduct;
  case_qty: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  [k: string]: any;
}

/** Tolerant class-region rule — substring match, never strict equality. */
export function isAmericasClass(className: string | null | undefined): boolean {
  return (className || '').toLowerCase().includes('america');
}

/** Unit price for a product under a company's class (server-validated rule). */
export function productPriceForClass(
  className: string | null | undefined,
  product: FormProduct,
): number {
  return resolveCatalogPrice(className, {
    price_americas: product.price_americas ?? null,
    price_international: product.price_international ?? null,
  });
}

/**
 * Region visibility — applies the visible_to_americas / _international
 * flags on products AND their categories. These flags existed in the
 * product/category forms for years but were never enforced anywhere
 * (audit WP5.3): international clients could see US-only kits. A missing
 * flag (null/undefined) means visible.
 */
export function filterProductsForRegion<P extends FormProduct>(
  products: P[],
  className: string | null | undefined,
): P[] {
  const americas = isAmericasClass(className);
  return products.filter((p) => {
    const productVisible = americas
      ? p.visible_to_americas !== false
      : p.visible_to_international !== false;
    const cat = p.category;
    const categoryVisible = !cat
      ? true
      : americas
        ? cat.visible_to_americas !== false
        : cat.visible_to_international !== false;
    return productVisible && categoryVisible;
  });
}

/** Group products by category, groups ordered by the category drag-order.
 *  The category type flows through from the caller's product type. */
export function groupProductsByCategory<P extends FormProduct>(
  products: P[],
): Array<{ category: NonNullable<P['category']> | null; products: P[] }> {
  type Cat = NonNullable<P['category']> | null;
  const map = new Map<number | string, { category: Cat; products: P[] }>();
  for (const p of products) {
    const key = p.category?.id ?? 'no-category';
    if (!map.has(key)) {
      map.set(key, { category: (p.category ?? null) as Cat, products: [] });
    }
    map.get(key)!.products.push(p);
  }
  return Array.from(map.values()).sort((a, b) => {
    const aOrder = a.category?.sort_order ?? 9999;
    const bOrder = b.category?.sort_order ?? 9999;
    return aOrder - bOrder;
  });
}

/**
 * Pure item-list transition for a case-quantity change (used by both the
 * order list and the support-fund list). quantity = cases × case_pack.
 */
export function applyCaseQtyChange<I extends FormOrderItem, P extends FormProduct>(
  prev: I[],
  product: P,
  newCaseQty: number,
  unitPrice: number,
): I[] {
  if (newCaseQty === 0) return prev.filter((i) => i.product_id !== product.id);
  const quantity = newCaseQty * (product.case_pack || 1);
  const totalPrice = quantity * unitPrice;
  const existing = prev.find((i) => i.product_id === product.id);
  if (existing) {
    return prev.map((i) =>
      i.product_id === product.id
        ? { ...i, case_qty: newCaseQty, quantity, unit_price: unitPrice, total_price: totalPrice }
        : i,
    );
  }
  return [
    ...prev,
    {
      product_id: product.id,
      product,
      case_qty: newCaseQty,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
    } as unknown as I,
  ];
}

/** Company's support-fund tier percent (0 when not enrolled). Handles the
 *  PostgREST join coming back as object OR single-element array. */
export function resolveSupportFundPercent(company: any): number {
  const rawSf = company?.support_fund;
  if (Array.isArray(rawSf)) return rawSf[0]?.percent || 0;
  return rawSf?.percent || 0;
}

export interface OrderTotals {
  subtotal: number;
  supportFundPercent: number;
  supportFundEarned: number;
  total: number;
}

export function computeOrderTotals(
  orderItems: FormOrderItem[],
  supportFundPercent: number,
): OrderTotals {
  const subtotal = orderItems.reduce((s, i) => s + i.total_price, 0);
  const creditEarningItems = orderItems.filter((i) => i.product.qualifies_for_credit_earning);
  const creditEarningSubtotal = creditEarningItems.reduce((s, i) => s + i.total_price, 0);
  const supportFundEarned = creditEarningSubtotal * (supportFundPercent / 100);
  return { subtotal, supportFundPercent, supportFundEarned, total: subtotal };
}

export interface SupportFundTotals {
  subtotal: number;
  supportFundEarned: number;
  remainingCredit: number;
  finalTotal: number; // top-up beyond earned credit — added to the order total
  itemCount: number;
}

export function computeSupportFundTotals(
  supportFundItems: FormOrderItem[],
  supportFundEarned: number,
): SupportFundTotals {
  const subtotal = supportFundItems.reduce((s, i) => s + i.total_price, 0);
  const remainingCredit = supportFundEarned - subtotal;
  const finalTotal = remainingCredit < 0 ? Math.abs(remainingCredit) : 0;
  return {
    subtotal,
    supportFundEarned,
    remainingCredit,
    finalTotal,
    itemCount: supportFundItems.length,
  };
}
