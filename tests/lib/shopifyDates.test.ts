import { describe, expect, it } from 'vitest';
import { storeDate } from '@/lib/shopify/core/dates';
import { buildOrderPlan } from '@/lib/shopify/core/orderTransform';
import { runOrderPipeline } from '@/lib/shopify/engine/pipeline';
import { ENGINE_CONFIG } from '@/lib/shopify/engine/config';
import { loadOrder } from '../helpers/shopifyFixtures';

describe('storeDate — NS dates follow the store timezone (America/New_York)', () => {
  it('late-evening ET orders keep their ET calendar date (#7277: 02:24Z = Aug 20, 10:24pm ET)', () => {
    expect(storeDate('2026-08-21T02:24:06Z')).toBe('2026-08-20');
  });
  it('midday UTC stays same-day', () => {
    expect(storeDate('2026-08-21T12:00:00Z')).toBe('2026-08-21');
  });
  it('EDT boundary: 03:59Z is previous day, 04:00Z is same day', () => {
    expect(storeDate('2026-08-21T03:59:59Z')).toBe('2026-08-20');
    expect(storeDate('2026-08-21T04:00:00Z')).toBe('2026-08-21');
  });
  it('winter (EST, UTC−5): 04:30Z is still previous day', () => {
    expect(storeDate('2026-01-15T04:30:00Z')).toBe('2026-01-14');
    expect(storeDate('2026-01-15T05:00:00Z')).toBe('2026-01-15');
  });

  it('pipeline books SO/invoice/payment with store-timezone dates', async () => {
    const order = loadOrder('b2c-latest') as any;
    // Force a timestamp that crosses the UTC date line: 10:24pm ET Aug 20.
    order.processedAt = '2026-08-21T02:24:06Z';
    order.transactions.forEach((t: any) => (t.processedAt = '2026-08-21T02:24:06Z'));
    const plan = buildOrderPlan(order);
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
    expect(so.payload.tranDate).toBe('2026-08-20');
    const inv = transforms.find((t) => t.to === 'invoice')!;
    expect(inv.body.tranDate).toBe('2026-08-20');
    const pay = transforms.find((t) => t.to === 'customerpayment')!;
    expect(pay.body.tranDate).toBe('2026-08-20');
  });
});
