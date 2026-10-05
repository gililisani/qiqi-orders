/**
 * Shared order-form logic — the single source for BOTH order forms
 * (AdminOrderFormView / ClientOrderFormView). They were forks carrying
 * character-identical copies of every function below (audit WP5.3); the
 * views now keep only state, fetching, and layout.
 *
 * Everything here is a pure function: inputs in, value out, no React.
 *
 * Pricing note: the tier price rule is IMPORTED from lib/orderPricing —
 * the exact function the server uses to compute and validate orders before
 * they reach NetSuite. Forms and server cannot drift.
 */

import { resolveUnitPrice } from '../../../../lib/orderPricing';

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
  /** Admin-set manual price — unit_price is kept through quantity changes. */
  price_override?: boolean;
  [k: string]: any;
}

/** The pricing inputs of a company row as the forms load it
 *  (`companies(*, class:classes(name))`). */
export function pricingContextOf(company: any): { priceTier: string | null; className: string | null } {
  const cls = Array.isArray(company?.class) ? company.class[0] : company?.class;
  return { priceTier: company?.price_tier ?? null, className: cls?.name ?? null };
}

/** Tolerant class-region rule — substring match, never strict equality. */
export function isAmericasClass(className: string | null | undefined): boolean {
  return (className || '').toLowerCase().includes('america');
}

/** Catalog unit price for a product at the company's pricing tier (the
 *  server's rule); null when the catalog has no price at that tier. */
export function productPriceForCompany(company: any, product: FormProduct): number | null {
  return resolveUnitPrice(pricingContextOf(company), {
    price_americas: product.price_americas ?? null,
    price_international: product.price_international ?? null,
    salon_price: product.salon_price ?? null,
    msrp: product.msrp ?? null,
  });
}

/** Products the company can actually be priced for — a product with no
 *  price at its tier is not offered (the server would refuse it). Products
 *  already on the order (`keepIds`) stay listed regardless, so a line whose
 *  product lost its tier price can still be given a manual price or removed
 *  instead of becoming an invisible, unsaveable line. */
export function filterPricedProducts<P extends FormProduct>(
  products: P[],
  company: any,
  keepIds?: Set<number>,
): P[] {
  return products.filter(
    (p) => productPriceForCompany(company, p) !== null || !!keepIds?.has(Number(p.id)),
  );
}

/** Key of a line within a form: regular and support-fund lines of the same
 *  product are separate lines (mirrors lib/orderSave lineKey). */
export function manualPriceKey(productId: number, isSupportFund: boolean): string {
  return `${Number(productId)}:${isSupportFund ? 'sf' : 'reg'}`;
}

/** Manual prices of an order's loaded lines, keyed by manualPriceKey — kept
 *  by the forms so a line removed and re-added (e.g. while retyping its
 *  quantity) gets its manual price back. */
export function manualPricesOf(items: FormOrderItem[], isSupportFund: boolean): Array<[string, number]> {
  return items
    .filter((i) => i.price_override)
    .map((i) => [manualPriceKey(i.product_id, isSupportFund), Number(i.unit_price)]);
}

/**
 * Lines loaded from a saved order, re-priced for display the way the
 * server will price them on save: catalog lines at the CURRENT tier price
 * (a tier or catalog change since the last save shows up before saving,
 * not after), manual-price lines untouched.
 */
export function repriceLoadedLines<I extends FormOrderItem>(items: I[], company: any): I[] {
  return items.map((i) => {
    if (i.price_override || !i.product) return i;
    const unit = productPriceForCompany(company, i.product);
    if (unit === null) return i;
    return { ...i, unit_price: unit, total_price: (Number(i.quantity) || 0) * unit };
  });
}

/** An admin's manual price on a line (null = back to the catalog price). */
export function applyManualPrice<I extends FormOrderItem>(
  prev: I[],
  productId: number,
  manualPrice: number | null,
  catalogPrice: number,
): I[] {
  return prev.map((i) => {
    if (i.product_id !== productId) return i;
    const unit = manualPrice ?? catalogPrice;
    return {
      ...i,
      unit_price: unit,
      total_price: (Number(i.quantity) || 0) * unit,
      price_override: manualPrice !== null,
    };
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
 *
 * `unitPrice` is the catalog price at the company's tier (null = none).
 * `manualPrice` is a remembered manual price for this line, applied when the
 * line is (re-)added. An existing line keeps its manual price.
 */
export function applyCaseQtyChange<I extends FormOrderItem, P extends FormProduct>(
  prev: I[],
  product: P,
  newCaseQty: number,
  unitPrice: number | null,
  manualPrice: number | null = null,
): I[] {
  if (newCaseQty === 0) return prev.filter((i) => i.product_id !== product.id);
  const quantity = newCaseQty * (product.case_pack || 1);
  const existing = prev.find((i) => i.product_id === product.id);
  if (existing) {
    // A manual price sticks to the line through quantity changes; a line
    // whose product has no tier price keeps the price it has.
    const lineUnit =
      existing.price_override || unitPrice === null ? existing.unit_price : unitPrice;
    return prev.map((i) =>
      i.product_id === product.id
        ? { ...i, case_qty: newCaseQty, quantity, unit_price: lineUnit, total_price: quantity * lineUnit }
        : i,
    );
  }
  const lineUnit = manualPrice ?? unitPrice ?? 0;
  return [
    ...prev,
    {
      product_id: product.id,
      product,
      case_qty: newCaseQty,
      quantity,
      unit_price: lineUnit,
      total_price: quantity * lineUnit,
      price_override: manualPrice !== null,
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
