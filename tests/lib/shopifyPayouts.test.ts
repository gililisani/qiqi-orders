import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { buildPayoutPlan } from '@/lib/shopify/core/payoutTransform';
import type { ShopifyBalanceTxn, ShopifyPayoutNode } from '@/lib/shopify/core/payoutTransform';

const DIR = path.join(__dirname, '..', 'fixtures', 'shopify');

function loadPayout(id: string): { payout: ShopifyPayoutNode; txns: ShopifyBalanceTxn[] } {
  const list = JSON.parse(fs.readFileSync(path.join(DIR, 'payouts-list.json'), 'utf8'));
  const payout = list.payouts.nodes.find((p: any) => p.legacyResourceId === id);
  const txns = JSON.parse(fs.readFileSync(path.join(DIR, `payout-${id}-transactions.json`), 'utf8'));
  return { payout, txns };
}

describe('buildPayoutPlan (real payout fixtures)', () => {
  it('big Monday payout: composition sums to net, fees extracted, Shop Cash + tax adjustment present', () => {
    const { payout, txns } = loadPayout('124572958775');
    const { plan, issues } = buildPayoutPlan(payout, txns);
    expect(issues).toEqual([]);
    expect(plan.netCents).toBe(858205);
    expect(plan.totalFeeCents).toBeGreaterThan(0);
    const types = plan.breakdown.map((b) => b.type);
    expect(types).toContain('CHARGE');
    expect(types).toContain('SHOP_CASH_CREDIT');
    expect(types).toContain('TAX_ADJUSTMENT_DEBIT'); // Shop-remitted marketplace tax deduction
    expect(plan.orders.length).toBeGreaterThan(40);
  });

  it('negative payout (refund-only day) is a withdrawal: net −$29.90', () => {
    const { payout, txns } = loadPayout('124483305527');
    const { plan, issues } = buildPayoutPlan(payout, txns);
    expect(issues).toEqual([]);
    expect(plan.netCents).toBe(-2990);
    expect(plan.totalFeeCents).toBe(0);
  });

  it('dispute payout surfaces chargebacks for alerting', () => {
    const { payout, txns } = loadPayout('124344991799');
    const { plan, issues } = buildPayoutPlan(payout, txns);
    expect(issues).toEqual([]);
    expect(plan.disputes.length).toBe(2); // one withdrawal + one reversal
    const types = plan.disputes.map((d) => d.type).sort();
    expect(types).toEqual(['DISPUTE_REVERSAL', 'DISPUTE_WITHDRAWAL']);
  });

  it('flags composition drift instead of booking it', () => {
    const { payout, txns } = loadPayout('124483305527');
    const tampered = txns.map((t) => (t.type === 'REFUND' ? { ...t, net: { amount: '-31.00' } } : t));
    const { issues } = buildPayoutPlan(payout, tampered);
    expect(issues.some((i) => i.code === 'TOTALS_MISMATCH')).toBe(true);
  });

  it('every captured payout fixture reconciles to the cent', () => {
    const files = fs.readdirSync(DIR).filter((f) => /^payout-\d+-transactions\.json$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const id = f.match(/^payout-(\d+)-/)![1];
      const { payout, txns } = loadPayout(id);
      const { issues } = buildPayoutPlan(payout, txns);
      expect(issues, `${id}: ${JSON.stringify(issues)}`).toEqual([]);
    }
  });
});
