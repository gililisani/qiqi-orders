import { describe, expect, it } from 'vitest';
import { buildFulfillmentPlans } from '@/lib/shopify/core/fulfillmentTransform';
import { loadOrder } from '../helpers/shopifyFixtures';

describe('buildFulfillmentPlans', () => {
  it('maps a fulfilled order to one IF plan with tracking and lines (#7243)', () => {
    const plans = buildFulfillmentPlans(loadOrder('b2c-latest'));
    expect(plans).toHaveLength(1);
    const p = plans[0];
    expect(p.shopifyFulfillmentId).toMatch(/^\d+$/);
    expect(p.tracking[0].carrier).toBe('DHL eCommerce');
    expect(p.lines.length).toBeGreaterThan(0);
    for (const l of p.lines) {
      expect(l.sku).toBeTruthy();
      expect(l.quantity).toBeGreaterThan(0);
    }
  });

  it('unfulfilled orders produce no plans', () => {
    expect(buildFulfillmentPlans(loadOrder('refunded-full'))).toEqual([]);
  });

  it('non-SUCCESS fulfillments (cancelled shipments) are excluded', () => {
    const order = loadOrder('b2c-latest');
    order.fulfillments[0].status = 'CANCELLED';
    expect(buildFulfillmentPlans(order)).toEqual([]);
  });
});
