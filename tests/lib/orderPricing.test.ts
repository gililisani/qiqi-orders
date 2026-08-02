import { describe, it, expect } from 'vitest';
import { resolveCatalogPrice, validateOrderPricing } from '@/lib/orderPricing';

const PRODUCT_A = { sku: 'FPS0018', price_americas: 10, price_international: 12, qualifies_for_credit_earning: true };
const PRODUCT_B = { sku: 'FPS0030', price_americas: 5, price_international: 6, qualifies_for_credit_earning: false };
const PRODUCT_C = { sku: 'FPS0044', price_americas: 8, price_international: 9, qualifies_for_credit_earning: true };

// pct=10: earned = 360 × 10% = 36; SF subtotal 80 → used capped at 36;
// total = (360 + 60) + (80 − 36 top-up) = 464.
const CLEAN_ITEMS = [
  { quantity: 36, unit_price: 10, total_price: 360, is_support_fund_item: false, product: PRODUCT_A },
  { quantity: 12, unit_price: 5, total_price: 60, is_support_fund_item: false, product: PRODUCT_B },
  { quantity: 10, unit_price: 8, total_price: 80, is_support_fund_item: true, product: PRODUCT_C },
];

const CLEAN_ORDER = {
  items: CLEAN_ITEMS,
  companyClassName: 'QIQI Americas Distributors',
  supportFundPercent: 10,
  orderTotalValue: 464,
  orderCreditEarned: 36,
  orderSupportFundUsed: 36,
};

describe('resolveCatalogPrice', () => {
  it('tolerant substring match on class name — never strict equality', () => {
    expect(resolveCatalogPrice('QIQI Americas', PRODUCT_A)).toBe(10);
    expect(resolveCatalogPrice('distributor - AMERICA', PRODUCT_A)).toBe(10);
    expect(resolveCatalogPrice('International', PRODUCT_A)).toBe(12);
    expect(resolveCatalogPrice(null, PRODUCT_A)).toBe(12); // no class → international
  });
});

describe('validateOrderPricing', () => {
  it('passes a clean order with SF top-up beyond earned credit', () => {
    const r = validateOrderPricing(CLEAN_ORDER);
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('passes a non-enrolled order (no SF, zero earned)', () => {
    const r = validateOrderPricing({
      items: CLEAN_ITEMS.slice(0, 2),
      companyClassName: 'QIQI Americas',
      supportFundPercent: null,
      orderTotalValue: 420,
      orderCreditEarned: 0,
      orderSupportFundUsed: 0,
    });
    expect(r.ok).toBe(true);
  });

  it('tolerates sub-cent float noise', () => {
    const r = validateOrderPricing({
      ...CLEAN_ORDER,
      orderCreditEarned: 36.004,
      orderTotalValue: 463.996,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects a tampered unit price', () => {
    const items = [
      { ...CLEAN_ITEMS[0], unit_price: 1, total_price: 36 },
      ...CLEAN_ITEMS.slice(1),
    ];
    const r = validateOrderPricing({ ...CLEAN_ORDER, items, orderTotalValue: 140, orderCreditEarned: 3.6, orderSupportFundUsed: 3.6 });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.field === 'unit_price' && v.sku === 'FPS0018')).toBe(true);
  });

  it('rejects the wrong regional price (international company, americas price stored)', () => {
    const r = validateOrderPricing({ ...CLEAN_ORDER, companyClassName: 'International Partners' });
    expect(r.ok).toBe(false);
    expect(r.violations.filter((v) => v.field === 'unit_price').length).toBe(3);
  });

  it('rejects a line total that does not equal quantity × unit price', () => {
    const items = [
      { ...CLEAN_ITEMS[0], total_price: 100 },
      ...CLEAN_ITEMS.slice(1),
    ];
    const r = validateOrderPricing({ ...CLEAN_ORDER, items });
    expect(r.violations.some((v) => v.field === 'total_price')).toBe(true);
  });

  it('rejects inflated credit_earned (only qualifying non-SF lines earn)', () => {
    // Correct earned is 36 (item B does not qualify, SF item never earns).
    const r = validateOrderPricing({ ...CLEAN_ORDER, orderCreditEarned: 50 });
    expect(r.violations.some((v) => v.field === 'credit_earned')).toBe(true);
  });

  it('rejects support_fund_used above the earned cap', () => {
    const r = validateOrderPricing({ ...CLEAN_ORDER, orderSupportFundUsed: 80 });
    expect(r.violations.some((v) => v.field === 'support_fund_used')).toBe(true);
  });

  it('rejects a tampered total_value', () => {
    const r = validateOrderPricing({ ...CLEAN_ORDER, orderTotalValue: 100 });
    expect(r.violations.some((v) => v.field === 'total_value')).toBe(true);
  });
});
