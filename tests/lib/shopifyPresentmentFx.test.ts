import { describe, expect, it } from 'vitest';
import { gateOrder } from '@/lib/shopify/core/validate';
import { buildOrderPlan } from '@/lib/shopify/core/orderTransform';
import { runOrderPipeline } from '@/lib/shopify/engine/pipeline';
import { expectedInvoiceCents } from '@/lib/shopify/engine/reconcile';
import { ENGINE_CONFIG } from '@/lib/shopify/engine/config';
import { loadOrder, fixtureSkus } from '../helpers/shopifyFixtures';

/** Shape a EUR-window order (#6599 pattern): store USD, customer saw EUR,
 *  Shopify's USD for the charge is 3¢ off the USD line math. */
function eurOrder() {
  const o = loadOrder('b2c-latest') as any;
  o.presentmentCurrencyCode = 'EUR';
  const sale = o.transactions.find((t: any) => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS');
  const chargedUsd = (Number(sale.amountSet.shopMoney.amount) - 0.03).toFixed(2);
  sale.amountSet = { shopMoney: { amount: chargedUsd, currencyCode: 'USD' }, presentmentMoney: { amount: '344.02', currencyCode: 'EUR' } };
  return o;
}

describe('EUR-window (presentment ≠ store currency) orders', () => {
  it('gate proceeds — presentment currency is cosmetic when the store is USD', () => {
    const gate = gateOrder(eurOrder(), fixtureSkus());
    expect(gate.outcome).toBe('proceed');
  });

  it('a non-USD STORE currency is still refused', () => {
    const o = eurOrder();
    o.currencyCode = 'EUR';
    const gate = gateOrder(o, fixtureSkus());
    expect(gate.outcome).toBe('error');
    expect((gate as any).issues[0].code).toBe('NOT_USD');
  });

  it('plan carries the presentment note and a −3¢ FX adjustment; invoice == money received', async () => {
    const plan = buildOrderPlan(eurOrder());
    expect(plan.presentment).toEqual({ currency: 'EUR', amount: '344.02' });
    expect(plan.fxAdjustmentCents).toBe(-3);
    expect(expectedInvoiceCents(plan)).toBe(plan.payments[0].amountCents);

    const creates: any[] = [];
    const transforms: any[] = [];
    const ns = {
      async findRecordIdByExternalId() { return null; },
      async createRecord(type: string, payload: any) { creates.push({ type, payload }); return String(creates.length); },
      async updateRecord() {},
      async transformRecord(_f: string, _id: string, to: string, body: any) { transforms.push({ to, body }); return '9'; },
      async suiteQL() { return []; },
      async resolveItemIdsBySku(skus: string[]) { return new Map(skus.map((s) => [s, `i-${s}`])); },
    };
    await runOrderPipeline(plan, ns as any, ENGINE_CONFIG);
    const so = creates.find((c) => c.type === 'salesOrder')!;
    expect(so.payload.memo).toContain('presented in EUR 344.02');
    const inv = transforms.find((t) => t.to === 'invoice')!;
    const fx = inv.body.item.items.find((l: any) => String(l.description).startsWith('FX rounding'));
    expect(fx).toBeTruthy();
    expect(fx.amount).toBe(-0.03);
    expect(fx.item.id).toBe(ENGINE_CONFIG.refundAdjustmentItemId);
  });

  it('USD orders carry no FX adjustment', () => {
    const plan = buildOrderPlan(loadOrder('b2c-latest'));
    expect(plan.presentment).toBeNull();
    expect(plan.fxAdjustmentCents).toBe(0);
  });
});
