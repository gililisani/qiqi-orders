import { describe, it, expect } from 'vitest';
import {
  applyCaseQtyChange,
  computeOrderTotals,
  computeSupportFundTotals,
  filterProductsForRegion,
  groupProductsByCategory,
  productPriceForClass,
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

describe('productPriceForClass', () => {
  it('mirrors the server-side validator rule (tolerant substring)', () => {
    expect(productPriceForClass('North America Distributors', P())).toBe(14);
    expect(productPriceForClass('International Distributors', P())).toBe(13.5);
    expect(productPriceForClass(null, P())).toBe(13.5); // no class → international
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
