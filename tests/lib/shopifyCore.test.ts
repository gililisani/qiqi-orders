import { describe, expect, it } from 'vitest';
import { centsToDecimal, toCents } from '@/lib/shopify/core/money';
import { gateOrder } from '@/lib/shopify/core/validate';
import { buildOrderPlan } from '@/lib/shopify/core/orderTransform';
import { decideCustomerMatch, extractBuyer } from '@/lib/shopify/core/customerMatch';
import type { NsCustomerCandidate, ShopifyOrder } from '@/lib/shopify/core/types';
import { allFixtureNames, fixtureSkus, loadOrder } from '../helpers/shopifyFixtures';

const SKUS = fixtureSkus();

describe('money', () => {
  it('parses decimal strings exactly', () => {
    expect(toCents('108.9')).toBe(10890);
    expect(toCents('0.0')).toBe(0);
    expect(toCents('47.2')).toBe(4720);
    expect(toCents('-29.9')).toBe(-2990);
    expect(toCents('386')).toBe(38600);
    expect(toCents('3.51')).toBe(351);
  });
  it('rejects garbage instead of propagating NaN', () => {
    expect(() => toCents('')).toThrow();
    expect(() => toCents('abc')).toThrow();
    expect(() => toCents(null)).toThrow();
    expect(() => toCents('1.239')).toThrow(); // sub-cent
  });
  it('round-trips', () => {
    expect(centsToDecimal(10890)).toBe('108.90');
    expect(centsToDecimal(-5)).toBe('-0.05');
  });
});

describe('gateOrder over real fixtures', () => {
  it('every captured paid fixture passes the gates', () => {
    // 'pos' is excluded: the store's only POS order (#1012) is a hand-keyed
    // custom item with no SKU — asserted below as a correct error.
    for (const name of allFixtureNames().filter((n) => n !== 'pos')) {
      const order = loadOrder(name);
      const result = gateOrder(order, SKUS);
      expect(result, `${name} (${order.name}): ${JSON.stringify(result)}`).toMatchObject({
        outcome: 'proceed',
      });
    }
  });

  it('POS custom items without SKU are caught, not guessed (#1012)', () => {
    const r = gateOrder(loadOrder('pos'), SKUS);
    expect(r.outcome).toBe('error');
    expect((r as any).issues.some((i: any) => i.code === 'MISSING_SKU')).toBe(true);
  });

  it('flags non-USD anywhere in the order (the EUR incident gate)', () => {
    const order = loadOrder('b2c-latest');
    order.currencyCode = 'EUR' as any;
    const r = gateOrder(order, SKUS);
    expect(r.outcome).toBe('error');
    expect((r as any).issues.some((i: any) => i.code === 'NOT_USD')).toBe(true);
  });

  it('flags a transaction in a foreign currency even when the order says USD', () => {
    const order = loadOrder('b2c-latest');
    order.transactions[0].amountSet.shopMoney.currencyCode = 'EUR';
    const r = gateOrder(order, SKUS);
    expect(r.outcome).toBe('error');
  });

  it('flags unknown SKUs', () => {
    const order = loadOrder('b2b-latest');
    const r = gateOrder(order, new Set(['SOMETHING_ELSE']));
    expect(r.outcome).toBe('error');
    expect((r as any).issues.every((i: any) => i.code === 'UNKNOWN_SKU')).toBe(true);
  });

  it('flags totals that do not add to the cent', () => {
    const order = loadOrder('b2b-latest');
    order.currentTotalPriceSet.shopMoney.amount = '999.99';
    const r = gateOrder(order, SKUS);
    expect(r.outcome).toBe('error');
    expect((r as any).issues.some((i: any) => i.code === 'TOTALS_MISMATCH')).toBe(true);
  });

  it('flags payments that do not cover the charged total', () => {
    const order = loadOrder('gateway-shop-cash');
    order.transactions = order.transactions.filter((t) => t.gateway !== 'shop_cash');
    const r = gateOrder(order, SKUS);
    expect(r.outcome).toBe('error');
    expect((r as any).issues.some((i: any) => i.code === 'PAYMENT_MISMATCH')).toBe(true);
  });

  it('skips test orders and unpaid orders without erroring', () => {
    const test = loadOrder('b2c-latest');
    test.test = true;
    expect(gateOrder(test, SKUS)).toMatchObject({ outcome: 'skip', reason: 'TEST_ORDER' });

    const pending = loadOrder('b2c-latest');
    pending.displayFinancialStatus = 'PENDING';
    expect(gateOrder(pending, SKUS)).toMatchObject({ outcome: 'skip', reason: 'UNPAID_YET' });
  });
});

describe('buildOrderPlan', () => {
  it('split tender yields one payment per successful money movement (#7201)', () => {
    const plan = buildOrderPlan(loadOrder('gateway-shop-cash'));
    expect(plan.payments).toHaveLength(2);
    const sum = plan.payments.reduce((s, p) => s + p.amountCents, 0);
    expect(sum).toBe(plan.totals.totalCents); // 141 + 4579 = 4720
    const gateways = plan.payments.map((p) => p.gateway).sort();
    expect(gateways).toEqual(['shop_cash', 'shopify_payments']);
    const cardPayment = plan.payments.find((p) => p.gateway === 'shopify_payments')!;
    expect(cardPayment.feeCents).toBeGreaterThan(0);
  });

  it('preserves every distinct tax jurisdiction verbatim (#7201 NY state + county)', () => {
    const plan = buildOrderPlan(loadOrder('multi-tax-domestic'));
    expect(plan.taxLines.length).toBe(2);
    const titles = plan.taxLines.map((t) => t.title);
    expect(titles).toContain('New York State Tax');
    expect(titles).toContain('Onondaga County Tax');
    const taxSum = plan.taxLines.reduce((s, t) => s + t.amountCents, 0);
    expect(taxSum).toBe(plan.totals.taxCents);
  });

  it('records charged prices, not catalog prices, on discounted orders', () => {
    const plan = buildOrderPlan(loadOrder('discounted'));
    expect(plan.discountCodes).toContain('Pack10');
    const discounted = plan.lines.find((l) => l.discountCents > 0)!;
    expect(discounted.netAmountCents).toBe(
      discounted.originalUnitPriceCents * discounted.quantity - discounted.discountCents,
    );
    // Whole-order invariant: lines + shipping + tax = total.
    const lineSum = plan.lines.reduce((s, l) => s + l.netAmountCents, 0);
    expect(lineSum + plan.totals.shippingCents + plan.totals.taxCents).toBe(plan.totals.totalCents);
  });

  it('payments cover charged total on every fixture (allowing for refunds)', () => {
    for (const name of allFixtureNames()) {
      const order = loadOrder(name);
      const plan = buildOrderPlan(order);
      const paid = plan.payments.reduce((s, p) => s + p.amountCents, 0);
      const refunded = toCents(order.totalRefundedSet.shopMoney.amount);
      expect(paid, `${name}: paid ${paid} != total ${plan.totals.totalCents} + refunded ${refunded}`).toBe(
        plan.totals.totalCents + refunded,
      );
    }
  });
});

describe('extractBuyer', () => {
  it('B2B: company identity with numeric ids', () => {
    const buyer = extractBuyer(loadOrder('b2b-latest'));
    expect(buyer.kind).toBe('b2b');
    expect(buyer.shopifyCompanyId).toBe('37879863');
    expect(buyer.shopifyCustomerId).toMatch(/^\d+$/);
    expect(buyer.email).toMatch(/@example\.com$/); // redacted but normalized
  });
  it('B2C: customer identity, no company', () => {
    const buyer = extractBuyer(loadOrder('b2c-latest'));
    expect(buyer.kind).toBe('b2c');
    expect(buyer.shopifyCompanyId).toBeNull();
    expect(buyer.shopifyCustomerId).toMatch(/^\d+$/);
  });
});

describe('decideCustomerMatch', () => {
  const cand = (via: NsCustomerCandidate['via'], id: string, extra: Partial<NsCustomerCandidate> = {}): NsCustomerCandidate => ({
    nsCustomerId: id,
    entityId: `C${id}`,
    companyName: null,
    email: null,
    isInactive: false,
    via,
    ...extra,
  });
  const b2bBuyer = extractBuyer(loadOrder('b2b-latest'));
  const b2cBuyer = extractBuyer(loadOrder('b2c-latest'));

  it('company stamp wins over everything', () => {
    const d = decideCustomerMatch(b2bBuyer, [cand('company_stamp', '1'), cand('customer_stamp', '2'), cand('email', '3')]);
    expect(d).toMatchObject({ action: 'use', nsCustomerId: '1', via: 'company_stamp', stampNeeded: false });
  });

  it('customer stamp matches; B2B gets the company stamp added', () => {
    const d = decideCustomerMatch(b2bBuyer, [cand('customer_stamp', '2')]);
    expect(d).toMatchObject({ action: 'use', nsCustomerId: '2', stampNeeded: true });
    const d2 = decideCustomerMatch(b2cBuyer, [cand('customer_stamp', '2')]);
    expect(d2).toMatchObject({ action: 'use', nsCustomerId: '2', stampNeeded: false });
  });

  it('single email match adopts + stamps', () => {
    const d = decideCustomerMatch(b2cBuyer, [cand('email', '9')]);
    expect(d).toMatchObject({ action: 'use', nsCustomerId: '9', via: 'email', stampNeeded: true });
  });

  it('multiple email matches are an error, never a guess (the 455-dup salon rule)', () => {
    const d = decideCustomerMatch(b2cBuyer, [cand('email', '9'), cand('email', '10')]);
    expect(d.action).toBe('error');
    expect((d as any).issue.code).toBe('AMBIGUOUS_CUSTOMER');
  });

  it('inactive candidates are ignored', () => {
    const d = decideCustomerMatch(b2cBuyer, [cand('email', '9'), cand('email', '10', { isInactive: true })]);
    expect(d).toMatchObject({ action: 'use', nsCustomerId: '9' });
  });

  it('no candidates → create with stamps', () => {
    const d = decideCustomerMatch(b2bBuyer, []);
    expect(d).toMatchObject({
      action: 'create',
      stamp: { shopifyCustomerId: b2bBuyer.shopifyCustomerId, shopifyCompanyId: '37879863' },
    });
  });
});
