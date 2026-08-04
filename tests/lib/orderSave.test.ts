import { describe, it, expect } from 'vitest';
import { computeOrderMoney, type CatalogProduct } from '@/lib/orderSave';
import { validateOrderPricing } from '@/lib/orderPricing';

const CATALOG: CatalogProduct[] = [
  { id: 1, sku: 'SHAMPOO', price_americas: 12.5, price_international: 10.0, qualifies_for_credit_earning: true, enable: true },
  { id: 2, sku: 'MASQUE', price_americas: 30.0, price_international: 27.75, qualifies_for_credit_earning: true, enable: true },
  { id: 3, sku: 'TESTER', price_americas: 5.0, price_international: 4.0, qualifies_for_credit_earning: false, enable: true },
  { id: 4, sku: 'RETIRED', price_americas: 9.0, price_international: 8.0, qualifies_for_credit_earning: true, enable: false },
];
const byId = new Map(CATALOG.map((p) => [p.id, p]));

describe('computeOrderMoney', () => {
  it('prices from the catalog by company class (tolerant match)', () => {
    const money = computeOrderMoney({
      items: [{ product_id: 1, quantity: 4, is_support_fund_item: false }],
      productsById: byId,
      companyClassName: 'Qiqi Americas Wholesale',
      supportFundPercent: 0,
    });
    expect(money.items[0].unit_price).toBe(12.5);
    expect(money.items[0].total_price).toBe(50);
    expect(money.total_value).toBe(50);

    const intl = computeOrderMoney({
      items: [{ product_id: 1, quantity: 4, is_support_fund_item: false }],
      productsById: byId,
      companyClassName: 'International Distributors',
      supportFundPercent: 0,
    });
    expect(intl.items[0].unit_price).toBe(10);
  });

  it('computes credit earned, SF used (capped) and the top-up in total_value', () => {
    // 10 × $10 qualifying = $100 regular → 10% = $10 earned.
    // SF items worth $15 → used = min(15, 10) = 10, top-up = $5.
    const money = computeOrderMoney({
      items: [
        { product_id: 1, quantity: 10, is_support_fund_item: false },
        { product_id: 3, quantity: 3, is_support_fund_item: true }, // 3 × $4 = $12
        { product_id: 3, quantity: 1, is_support_fund_item: true }, // this + above = $16 SF... adjust below
      ],
      productsById: byId,
      companyClassName: 'intl',
      supportFundPercent: 10,
    });
    expect(money.credit_earned).toBe(10);
    expect(money.support_fund_used).toBe(10); // capped at earned
    expect(money.total_value).toBe(100 + (16 - 10)); // regular + top-up
  });

  it('non-qualifying products earn no credit', () => {
    const money = computeOrderMoney({
      items: [{ product_id: 3, quantity: 10, is_support_fund_item: false }],
      productsById: byId,
      companyClassName: 'intl',
      supportFundPercent: 10,
    });
    expect(money.credit_earned).toBe(0);
    expect(money.total_value).toBe(40);
  });

  it('assigns positional sort_order (preserves the drag order)', () => {
    const money = computeOrderMoney({
      items: [
        { product_id: 2, quantity: 1, is_support_fund_item: false },
        { product_id: 1, quantity: 1, is_support_fund_item: false },
        { product_id: 3, quantity: 1, is_support_fund_item: true },
      ],
      productsById: byId,
      companyClassName: 'intl',
      supportFundPercent: 0,
    });
    expect(money.items.map((i) => [i.product_id, i.sort_order])).toEqual([
      [2, 0],
      [1, 1],
      [3, 2],
    ]);
  });

  it('rejects unknown, disabled and bad-quantity items', () => {
    const base = { productsById: byId, companyClassName: 'intl', supportFundPercent: 0 };
    expect(() =>
      computeOrderMoney({ ...base, items: [{ product_id: 99, quantity: 1, is_support_fund_item: false }] })
    ).toThrow(/Unknown product/);
    expect(() =>
      computeOrderMoney({ ...base, items: [{ product_id: 4, quantity: 1, is_support_fund_item: false }] })
    ).toThrow(/not available/);
    expect(() =>
      computeOrderMoney({ ...base, items: [{ product_id: 1, quantity: 0, is_support_fund_item: false }] })
    ).toThrow(/positive whole number/);
    expect(() =>
      computeOrderMoney({ ...base, items: [{ product_id: 1, quantity: 1.5, is_support_fund_item: false }] })
    ).toThrow(/positive whole number/);
  });

  // THE contract: what the save path writes, the push-so gate must accept.
  // If these two modules ever drift, every NetSuite push starts 409ing.
  it('output always passes validateOrderPricing (write-side ↔ validate-side)', () => {
    const scenarios = [
      { className: 'Qiqi Americas', pct: 10, items: [
        { product_id: 1, quantity: 7, is_support_fund_item: false },
        { product_id: 2, quantity: 3, is_support_fund_item: false },
        { product_id: 3, quantity: 5, is_support_fund_item: true },
      ]},
      { className: 'International', pct: 3, items: [
        { product_id: 2, quantity: 13, is_support_fund_item: false },
        { product_id: 3, quantity: 11, is_support_fund_item: false },
      ]},
      { className: null, pct: 0, items: [
        { product_id: 1, quantity: 1, is_support_fund_item: false },
      ]},
    ];

    for (const s of scenarios) {
      const money = computeOrderMoney({
        items: s.items,
        productsById: byId,
        companyClassName: s.className,
        supportFundPercent: s.pct,
      });
      const check = validateOrderPricing({
        items: money.items.map((i) => ({
          quantity: i.quantity,
          unit_price: i.unit_price,
          total_price: i.total_price,
          is_support_fund_item: i.is_support_fund_item,
          product: byId.get(i.product_id) ?? null,
        })),
        companyClassName: s.className,
        supportFundPercent: s.pct,
        orderTotalValue: money.total_value,
        orderCreditEarned: money.credit_earned,
        orderSupportFundUsed: money.support_fund_used,
      });
      expect(check.violations).toEqual([]);
    }
  });
});
