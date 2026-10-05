import { describe, it, expect } from 'vitest';
import { computeOrderMoney, parseManualPrice, lineKey, type CatalogProduct } from '@/lib/orderSave';
import { validateOrderPricing } from '@/lib/orderPricing';

const CATALOG: CatalogProduct[] = [
  { id: 1, sku: 'SHAMPOO', price_americas: 12.5, price_international: 10.0, salon_price: 25, msrp: 50, qualifies_for_credit_earning: true, enable: true },
  { id: 2, sku: 'MASQUE', price_americas: 30.0, price_international: 27.75, salon_price: 56, msrp: null, qualifies_for_credit_earning: true, enable: true },
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
      // Salon-priced distributor with support funds + a manual price line.
      { className: 'International Distributors', tier: 'salon', pct: 10, items: [
        { product_id: 1, quantity: 12, is_support_fund_item: false },
        { product_id: 2, quantity: 6, is_support_fund_item: false, unit_price_override: 49.99 },
        { product_id: 1, quantity: 2, is_support_fund_item: true },
      ]},
      { className: 'North America Distributors', tier: 'international', pct: 0, items: [
        { product_id: 2, quantity: 5, is_support_fund_item: false },
      ]},
    ] as Array<{ className: string | null; tier?: string; pct: number; items: any[] }>;

    for (const s of scenarios) {
      const money = computeOrderMoney({
        items: s.items,
        productsById: byId,
        companyClassName: s.className,
        companyPriceTier: s.tier ?? null,
        supportFundPercent: s.pct,
      });
      const check = validateOrderPricing({
        items: money.items.map((i) => ({
          quantity: i.quantity,
          unit_price: i.unit_price,
          total_price: i.total_price,
          is_support_fund_item: i.is_support_fund_item,
          price_override: i.price_override,
          product: byId.get(i.product_id) ?? null,
        })),
        companyClassName: s.className,
        companyPriceTier: s.tier ?? null,
        supportFundPercent: s.pct,
        orderTotalValue: money.total_value,
        orderCreditEarned: money.credit_earned,
        orderSupportFundUsed: money.support_fund_used,
      });
      expect(check.violations).toEqual([]);
    }
  });

  it('prices at the company tier, not the class (Salon distributor)', () => {
    const money = computeOrderMoney({
      items: [{ product_id: 1, quantity: 24, is_support_fund_item: false }],
      productsById: byId,
      companyClassName: 'International Distributors',
      companyPriceTier: 'salon',
      supportFundPercent: 0,
    });
    expect(money.items[0].unit_price).toBe(25);
    expect(money.total_value).toBe(600);
    expect(money.items[0].price_override).toBe(false);
  });

  it('support funds are earned on what the company actually pays', () => {
    const money = computeOrderMoney({
      items: [{ product_id: 1, quantity: 10, is_support_fund_item: false }],
      productsById: byId,
      companyClassName: 'International Distributors',
      companyPriceTier: 'salon',
      supportFundPercent: 10,
    });
    expect(money.credit_earned).toBe(25); // 10 × $25 salon × 10%
  });

  it('refuses a product with no price at the company tier', () => {
    expect(() =>
      computeOrderMoney({
        items: [{ product_id: 2, quantity: 1, is_support_fund_item: false }],
        productsById: byId,
        companyClassName: 'intl',
        companyPriceTier: 'msrp',
        supportFundPercent: 0,
      }),
    ).toThrow(/no MSRP \(consumer\) price/);
  });

  it('a manual price replaces the catalog price and is flagged', () => {
    const money = computeOrderMoney({
      items: [
        { product_id: 1, quantity: 3, is_support_fund_item: false, unit_price_override: 11.111 },
        { product_id: 2, quantity: 1, is_support_fund_item: false, unit_price_override: null },
      ],
      productsById: byId,
      companyClassName: 'intl',
      supportFundPercent: 0,
    });
    expect(money.items[0]).toMatchObject({ unit_price: 11.11, total_price: 33.33, price_override: true });
    expect(money.items[1]).toMatchObject({ unit_price: 27.75, price_override: false });
  });

  it('a manual price also lets a product without a tier price be ordered', () => {
    const money = computeOrderMoney({
      items: [{ product_id: 2, quantity: 1, is_support_fund_item: false, unit_price_override: 80 }],
      productsById: byId,
      companyClassName: 'intl',
      companyPriceTier: 'msrp',
      supportFundPercent: 0,
    });
    expect(money.total_value).toBe(80);
  });

  it('rejects invalid manual prices instead of falling back to the catalog', () => {
    expect(parseManualPrice(undefined, 'X')).toBeNull();
    expect(parseManualPrice('', 'X')).toBeNull();
    expect(parseManualPrice(0, 'X')).toBe(0);
    expect(parseManualPrice('12.345', 'X')).toBe(12.35);
    expect(() => parseManualPrice(-1, 'X')).toThrow(/manual price/);
    expect(() => parseManualPrice('abc', 'X')).toThrow(/manual price/);
    expect(() => parseManualPrice(1e9, 'X')).toThrow(/manual price/);
  });

  it('lineKey separates the regular and support-fund line of a product', () => {
    expect(lineKey(5, false)).not.toBe(lineKey(5, true));
    expect(lineKey('5', null)).toBe(lineKey(5, false));
  });
});
