import { describe, it, expect } from 'vitest';
import {
  effectivePriceTier,
  priceForTier,
  resolveUnitPrice,
  validateOrderPricing,
} from '@/lib/orderPricing';

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

describe('resolveUnitPrice — automatic tier from the class', () => {
  it('tolerant substring match on class name — never strict equality', () => {
    expect(resolveUnitPrice({ className: 'QIQI Americas' }, PRODUCT_A)).toBe(10);
    expect(resolveUnitPrice({ className: 'distributor - AMERICA' }, PRODUCT_A)).toBe(10);
    expect(resolveUnitPrice({ className: 'International' }, PRODUCT_A)).toBe(12);
    expect(resolveUnitPrice({ className: null }, PRODUCT_A)).toBe(12); // no class → international
  });
});

describe('pricing tiers', () => {
  const SALON_PRODUCT = { price_americas: 25, price_international: 25, salon_price: 50, msrp: null };

  it('an explicit tier wins over the class (the NetSuite class is unchanged)', () => {
    expect(effectivePriceTier({ priceTier: 'salon', className: 'International Distributors' })).toBe('salon');
    expect(effectivePriceTier({ priceTier: 'americas', className: 'International Distributors' })).toBe('americas');
    expect(resolveUnitPrice({ priceTier: 'salon', className: 'International Distributors' }, SALON_PRODUCT)).toBe(50);
  });

  it('null / unknown tier falls back to the automatic class rule', () => {
    expect(effectivePriceTier({ priceTier: null, className: 'North America Distributors' })).toBe('americas');
    expect(effectivePriceTier({ priceTier: 'bogus', className: 'International Distributors' })).toBe('international');
    expect(effectivePriceTier({ priceTier: ' SALON ', className: null })).toBe('salon');
  });

  it('a missing tier price is null — never silently $0', () => {
    expect(priceForTier('msrp', SALON_PRODUCT)).toBeNull(); // pro-use product
    expect(priceForTier('salon', { price_americas: 1, price_international: 1 })).toBeNull();
    expect(priceForTier('salon', { price_americas: 1, price_international: 1, salon_price: 0 })).toBeNull();
    expect(priceForTier('salon', { price_americas: 1, price_international: 1, salon_price: '28' })).toBe(28);
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

  it('accepts a salon-tier order priced at salon prices', () => {
    const product = { ...PRODUCT_A, salon_price: 24 };
    const r = validateOrderPricing({
      items: [{ quantity: 10, unit_price: 24, total_price: 240, is_support_fund_item: false, product }],
      companyClassName: 'International Distributors',
      companyPriceTier: 'salon',
      supportFundPercent: 0,
      orderTotalValue: 240,
      orderCreditEarned: 0,
      orderSupportFundUsed: 0,
    });
    expect(r.violations).toEqual([]);
  });

  it('flags an order still at distributor prices after the tier changed to salon', () => {
    const product = { ...PRODUCT_A, salon_price: 24 };
    const r = validateOrderPricing({
      items: [{ quantity: 10, unit_price: 12, total_price: 120, is_support_fund_item: false, product }],
      companyClassName: 'International Distributors',
      companyPriceTier: 'salon',
      supportFundPercent: 0,
      orderTotalValue: 120,
      orderCreditEarned: 0,
      orderSupportFundUsed: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.violations[0].detail).toMatch(/pricing tier changed/);
  });

  it('accepts an admin manual price without comparing it to the catalog', () => {
    const r = validateOrderPricing({
      items: [{ quantity: 10, unit_price: 17.5, total_price: 175, is_support_fund_item: false, price_override: true, product: PRODUCT_A }],
      companyClassName: 'International',
      supportFundPercent: 0,
      orderTotalValue: 175,
      orderCreditEarned: 0,
      orderSupportFundUsed: 0,
    });
    expect(r.violations).toEqual([]);
  });

  it('still checks line math on a manual price', () => {
    const r = validateOrderPricing({
      items: [{ quantity: 10, unit_price: 17.5, total_price: 200, is_support_fund_item: false, price_override: true, product: PRODUCT_A }],
      companyClassName: 'International',
      supportFundPercent: 0,
      orderTotalValue: 200,
      orderCreditEarned: 0,
      orderSupportFundUsed: 0,
    });
    expect(r.violations.map((v) => v.field)).toEqual(['total_price']);
  });

  it('flags a product with no price at the company tier', () => {
    const r = validateOrderPricing({
      items: [{ quantity: 1, unit_price: 12, total_price: 12, is_support_fund_item: false, product: PRODUCT_A }],
      companyClassName: 'International',
      companyPriceTier: 'msrp',
      supportFundPercent: 0,
      orderTotalValue: 12,
      orderCreditEarned: 0,
      orderSupportFundUsed: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.violations[0].detail).toMatch(/no MSRP \(consumer\) price/);
  });
});
