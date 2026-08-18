import { describe, expect, it } from 'vitest';
import { buildRefundPlans } from '@/lib/shopify/core/refundTransform';
import { loadOrder } from '../helpers/shopifyFixtures';

describe('buildRefundPlans', () => {
  it('full refund (#7083): line + shipping residual, restock honored, money back via same gateway', () => {
    const { plans, issues } = buildRefundPlans(loadOrder('refunded-full'));
    expect(issues).toEqual([]);
    expect(plans).toHaveLength(1);
    const p = plans[0];
    expect(p.totalCents).toBe(3890);
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0]).toMatchObject({ sku: 'FPS0020', quantity: 1, restock: true, subtotalCents: 3000, taxCents: 0 });
    // $38.90 refunded − $30.00 line = $8.90 shipping residual.
    expect(p.residualCents).toBe(890);
    expect(p.transactions).toHaveLength(1);
    expect(p.transactions[0]).toMatchObject({ gateway: 'shopify_payments', amountCents: 3890 });
  });

  it('amount-only refund (#7084): no lines, full amount as residual', () => {
    const { plans, issues } = buildRefundPlans(loadOrder('refunded-partial'));
    expect(issues).toEqual([]);
    expect(plans).toHaveLength(1);
    const p = plans[0];
    expect(p.lines).toHaveLength(0);
    expect(p.residualCents).toBe(2990);
    expect(p.totalCents).toBe(2990);
    expect(p.transactions[0].gateway).toBe('shopify_payments');
  });

  it('no-restock lines are marked restock=false', () => {
    const order = loadOrder('refunded-full');
    order.refunds[0].refundLineItems.nodes[0].restocked = false;
    order.refunds[0].refundLineItems.nodes[0].restockType = 'NO_RESTOCK';
    const { plans } = buildRefundPlans(order);
    expect(plans[0].lines[0].restock).toBe(false);
  });

  it('flags a refund whose transactions do not cover its total', () => {
    const order = loadOrder('refunded-full');
    order.refunds[0].transactions.nodes = [];
    const { issues } = buildRefundPlans(order);
    expect(issues.some((i) => i.code === 'PAYMENT_MISMATCH')).toBe(true);
  });

  it('orders without refunds produce no plans', () => {
    const { plans, issues } = buildRefundPlans(loadOrder('b2b-latest'));
    expect(plans).toEqual([]);
    expect(issues).toEqual([]);
  });
});
