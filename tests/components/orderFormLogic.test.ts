import { describe, it, expect } from 'vitest';
import {
  applyCaseQtyChange,
  computeOrderTotals,
  computeSupportFundTotals,
  filterProductsForRegion,
  groupProductsByCategory,
  productPriceForCompany,
  filterPricedProducts,
  repriceLoadedLines,
  applyManualPrice,
  manualPriceKey,
  manualPricesOf,
  type FormProduct,
} from '@/app/components/shared/orderForm/orderFormLogic';

const P = (over: Record<string, unknown> = {}) => ({
  id: 1,
  case_pack: 12,
  price_americas: 14,
  price_international: 13.5,
  qualifies_for_credit_earning: true,
  ...over,
});

const co = (className: string | null, price_tier: string | null = null) => ({
  price_tier,
  class: className ? { name: className } : null,
});

describe('productPriceForCompany', () => {
  it('mirrors the server-side rule (tolerant class match when no tier)', () => {
    expect(productPriceForCompany(co('North America Distributors'), P())).toBe(14);
    expect(productPriceForCompany(co('International Distributors'), P())).toBe(13.5);
    expect(productPriceForCompany(co(null), P())).toBe(13.5); // no class → international
    expect(productPriceForCompany({ class: [{ name: 'North America Distributors' }] }, P())).toBe(14);
  });

  it('uses the company pricing tier when set', () => {
    expect(productPriceForCompany(co('International Distributors', 'salon'), P({ salon_price: 28 }))).toBe(28);
    expect(productPriceForCompany(co('International Distributors', 'salon'), P())).toBeNull();
  });

  it('filterPricedProducts drops products with no price at the tier', () => {
    const list = [P({ id: 1, salon_price: 28 }), P({ id: 2 })];
    expect(filterPricedProducts(list, co('International', 'salon')).map((p) => p.id)).toEqual([1]);
    expect(filterPricedProducts(list, co('International')).map((p) => p.id)).toEqual([1, 2]);
    // A product already on the order stays listed even without a tier price.
    expect(filterPricedProducts(list, co('International', 'salon'), new Set([2])).map((p) => p.id)).toEqual([1, 2]);
  });
});

describe('manual line prices', () => {
  const line = (over: Record<string, unknown> = {}) => ({
    product_id: 1,
    product: P({ salon_price: 28 }) as FormProduct,
    case_qty: 1,
    quantity: 12,
    unit_price: 13.5,
    total_price: 162,
    ...over,
  });

  it('applyCaseQtyChange keeps a manual price through quantity changes', () => {
    const prev = [line({ unit_price: 20, total_price: 240, price_override: true })];
    const next = applyCaseQtyChange(prev, P() as FormProduct, 2, 13.5);
    expect(next[0]).toMatchObject({ quantity: 24, unit_price: 20, total_price: 480, price_override: true });
  });

  it('applyManualPrice sets and clears the override', () => {
    const set = applyManualPrice([line()], 1, 20, 13.5);
    expect(set[0]).toMatchObject({ unit_price: 20, total_price: 240, price_override: true });
    const cleared = applyManualPrice(set, 1, null, 13.5);
    expect(cleared[0]).toMatchObject({ unit_price: 13.5, total_price: 162, price_override: false });
  });

  it('a line removed and re-added gets its remembered manual price back', () => {
    const removed = applyCaseQtyChange([line({ unit_price: 20, total_price: 240, price_override: true })], P() as FormProduct, 0, 13.5);
    expect(removed).toEqual([]);
    const readded = applyCaseQtyChange(removed, P() as FormProduct, 2, 13.5, 20);
    expect(readded[0]).toMatchObject({ quantity: 24, unit_price: 20, total_price: 480, price_override: true });
    const plain = applyCaseQtyChange([], P() as FormProduct, 1, 13.5);
    expect(plain[0]).toMatchObject({ unit_price: 13.5, price_override: false });
  });

  it('a line whose product has no tier price keeps its price on quantity change', () => {
    const next = applyCaseQtyChange([line({ unit_price: 13.5, total_price: 162 })], P() as FormProduct, 2, null);
    expect(next[0]).toMatchObject({ quantity: 24, unit_price: 13.5, total_price: 324 });
  });

  it('manualPricesOf / manualPriceKey key regular and SF lines separately', () => {
    const lines = [line({ unit_price: 20, price_override: true }), line({ product_id: 2 })];
    expect(manualPricesOf(lines as any, false)).toEqual([[manualPriceKey(1, false), 20]]);
    expect(manualPriceKey(1, false)).not.toBe(manualPriceKey(1, true));
  });

  it('repriceLoadedLines shows the current tier price, leaving manual lines alone', () => {
    const lines = [line(), line({ product_id: 2, unit_price: 9, total_price: 108, price_override: true })];
    const out = repriceLoadedLines(lines, co('International Distributors', 'salon'));
    expect(out[0]).toMatchObject({ unit_price: 28, total_price: 336 });
    expect(out[1]).toMatchObject({ unit_price: 9, total_price: 108 });
  });
});

describe('filterProductsForRegion', () => {
  const products = [
    P({ id: 1, visible_to_international: false }), // US-only kit
    P({ id: 2, visible_to_americas: false }),      // EU-plug tool
    P({ id: 3 }),                                  // visible everywhere
    P({ id: 4, category: { id: 9, visible_to_international: false } }), // hidden via category
  ];

  it('americas class hides americas-hidden products', () => {
    const ids = filterProductsForRegion(products, 'North America Distributors').map((p) => p.id);
    expect(ids).toEqual([1, 3, 4]);
  });

  it('international class hides intl-hidden products AND categories', () => {
    const ids = filterProductsForRegion(products, 'International Distributors').map((p) => p.id);
    expect(ids).toEqual([2, 3]);
  });

  it('missing flags mean visible', () => {
    expect(filterProductsForRegion([P({ id: 5 })], 'International').length).toBe(1);
  });
});

describe('applyCaseQtyChange', () => {
  const product = P({ id: 7, case_pack: 6 });

  it('adds a new line: quantity = cases × case_pack at the given unit price', () => {
    const next = applyCaseQtyChange([], product as any, 3, 13.5);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ product_id: 7, case_qty: 3, quantity: 18, unit_price: 13.5, total_price: 243 });
  });

  it('updates an existing line in place', () => {
    const first = applyCaseQtyChange([], product as any, 3, 13.5);
    const next = applyCaseQtyChange(first, product as any, 5, 13.5);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ case_qty: 5, quantity: 30, total_price: 405 });
  });

  it('removes the line at zero cases', () => {
    const first = applyCaseQtyChange([], product as any, 3, 13.5);
    expect(applyCaseQtyChange(first, product as any, 0, 13.5)).toHaveLength(0);
  });
});

describe('totals', () => {
  const items = [
    { product_id: 1, product: P({ qualifies_for_credit_earning: true }), case_qty: 1, quantity: 12, unit_price: 10, total_price: 120 },
    { product_id: 2, product: P({ id: 2, qualifies_for_credit_earning: false }), case_qty: 1, quantity: 12, unit_price: 5, total_price: 60 },
  ];

  it('earned credit counts only qualifying lines', () => {
    const t = computeOrderTotals(items as any, 10);
    expect(t.subtotal).toBe(180);
    expect(t.supportFundEarned).toBeCloseTo(12); // 10% of 120, not 180
  });

  it('SF under budget → no top-up; over budget → top-up equals the overage', () => {
    const sfSmall = [{ product_id: 3, product: P({ id: 3 }), case_qty: 1, quantity: 1, unit_price: 5, total_price: 5 }];
    const under = computeSupportFundTotals(sfSmall as any, 12);
    expect(under.remainingCredit).toBe(7);
    expect(under.finalTotal).toBe(0);

    const sfBig = [{ product_id: 3, product: P({ id: 3 }), case_qty: 1, quantity: 1, unit_price: 30, total_price: 30 }];
    const over = computeSupportFundTotals(sfBig as any, 12);
    expect(over.remainingCredit).toBe(-18);
    expect(over.finalTotal).toBe(18); // client pays the difference
  });
});

describe('groupProductsByCategory', () => {
  it('groups and orders by category drag-order, uncategorized last', () => {
    const products: FormProduct[] = [
      P({ id: 1, category: { id: 2, sort_order: 2 } }),
      P({ id: 2, category: { id: 1, sort_order: 1 } }),
      P({ id: 3, category: null }),
    ];
    const groups = groupProductsByCategory(products);
    expect(groups.map((g) => g.category?.id ?? 'none')).toEqual([1, 2, 'none']);
  });
});
