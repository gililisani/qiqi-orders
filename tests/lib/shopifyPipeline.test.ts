import { describe, expect, it } from 'vitest';
import { buildOrderPlan } from '@/lib/shopify/core/orderTransform';
import { runOrderPipeline, PipelineError, type NsApi } from '@/lib/shopify/engine/pipeline';
import { ENGINE_CONFIG, type EngineConfig } from '@/lib/shopify/engine/config';
import { loadOrder, fixtureSkus } from '../helpers/shopifyFixtures';

/** In-memory NS double: externalid-addressable record store. */
function fakeNs(seed: { customersByQuery?: Record<string, any[]> } = {}) {
  const byExt = new Map<string, string>(); // `${type}:${extId}` -> id
  const creates: Array<{ type: string; payload: any }> = [];
  const updates: Array<{ type: string; id: string; payload: any }> = [];
  const transforms: Array<{ from: string; fromId: string; to: string; body: any }> = [];
  let nextId = 100;

  const ns: NsApi = {
    async findRecordIdByExternalId(type, extId) {
      return byExt.get(`${type}:${extId}`) ?? null;
    },
    async createRecord(type, payload) {
      creates.push({ type, payload });
      const id = String(nextId++);
      if (payload.externalId) byExt.set(`${type}:${payload.externalId}`, id);
      return id;
    },
    async updateRecord(type, id, payload) {
      updates.push({ type, id, payload });
      if (payload.externalId) byExt.set(`${type}:${payload.externalId}`, id);
    },
    async transformRecord(from, fromId, to, body) {
      transforms.push({ from, fromId, to, body });
      const id = String(nextId++);
      if (body.externalId) byExt.set(`${to.toLowerCase()}:${body.externalId}`, id);
      return id;
    },
    async suiteQL(query: string) {
      for (const [needle, rows] of Object.entries(seed.customersByQuery ?? {})) {
        if (query.includes(needle)) return rows as any;
      }
      return [];
    },
    async resolveItemIdsBySku(skus) {
      return new Map(skus.map((s) => [s, `item-${s}`]));
    },
  };
  return { ns, byExt, creates, updates, transforms };
}

const CONFIG: EngineConfig = ENGINE_CONFIG;

describe('runOrderPipeline', () => {
  it('creates the full chain for a new B2C customer', async () => {
    const plan = buildOrderPlan(loadOrder('b2c-latest'));
    const { ns, creates, transforms } = fakeNs();
    const r = await runOrderPipeline(plan, ns, CONFIG);

    expect(r.created).toMatchObject({ customer: true, so: true, invoice: true, payments: 1 });
    expect(r.customerVia).toBe('created');
    const cust = creates.find((c) => c.type === 'customer')!;
    expect(cust.payload.isPerson).toBe(true);
    // NetScore's field is Integer-typed in NS — must go over as a number.
    expect(cust.payload.custentity_shop_cust_id).toBe(Number(plan.buyer.shopifyCustomerId));
    expect(cust.payload.category).toEqual({ id: '10' });
    expect(cust.payload.custentity3).toEqual({ id: '4' });
    expect(cust.payload.terms).toEqual({ id: '8' }); // Upfront on Sales order
    expect(cust.payload.salesRep).toEqual({ id: CONFIG.salesRepId }); // "Shopify"
    expect(cust.payload.addressBook.items.length).toBeGreaterThan(0);
    expect(cust.payload.addressBook.items[0].defaultBilling).toBe(true);
    expect(cust.payload.externalId).toContain('CUST-');

    const so = creates.find((c) => c.type === 'salesOrder')!;
    expect(so.payload.externalId).toBe(`SHOPORD-${plan.shopifyOrderId}`);
    expect(so.payload.custbody_shopify_order_id).toBe(Number(plan.shopifyOrderId)); // Integer field in NS
    const lineSum = so.payload.item.items.reduce((s: number, l: any) => s + l.amount, 0);
    expect(Math.round(lineSum * 100)).toBe(plan.lines.reduce((s, l) => s + l.netAmountCents, 0));

    const inv = transforms.find((t) => t.to === 'invoice')!;
    expect(inv.body.externalId).toBe(`SHOPINV-${plan.shopifyOrderId}`);
    const pay = transforms.find((t) => t.to === 'customerpayment')!;
    expect(pay.body.account.id).toBe('1019');
  });

  it('re-running the same order adopts everything and creates nothing', async () => {
    const plan = buildOrderPlan(loadOrder('b2c-latest'));
    const { ns, creates } = fakeNs();
    await runOrderPipeline(plan, ns, CONFIG);
    const createCountAfterFirst = creates.length;

    const r2 = await runOrderPipeline(plan, ns, CONFIG);
    expect(creates.length).toBe(createCountAfterFirst);
    expect(r2.created).toMatchObject({ customer: false, so: false, invoice: false, payments: 0 });
    expect(r2.customerVia).toBe('external_id');
  });

  it('adopts a NetScore-stamped customer and stamps our externalid on it', async () => {
    const plan = buildOrderPlan(loadOrder('b2b-latest'));
    const { ns, creates, updates } = fakeNs({
      customersByQuery: {
        custentity_shop_cust_id: [
          { id: '7179', entityid: 'C1921', companyname: 'Pure Art Salon', email: 'x@y.com', isinactive: 'F' },
        ],
      },
    });
    const r = await runOrderPipeline(plan, ns, CONFIG);
    expect(r.nsCustomerId).toBe('7179');
    expect(r.customerVia).toBe('customer_stamp');
    expect(creates.find((c) => c.type === 'customer')).toBeUndefined();
    const stamp = updates.find((u) => u.type === 'customer' && u.id === '7179')!;
    expect(stamp.payload.externalId).toContain('CO-');
  });

  it('ambiguous email matches stop the pipeline before any NS write', async () => {
    const plan = buildOrderPlan(loadOrder('b2c-latest'));
    const { ns, creates } = fakeNs({
      customersByQuery: {
        'LOWER(email)': [
          { id: '1', entityid: 'C1', companyname: null, email: 'a', isinactive: 'F' },
          { id: '2', entityid: 'C2', companyname: null, email: 'a', isinactive: 'F' },
        ],
      },
    });
    await expect(runOrderPipeline(plan, ns, CONFIG)).rejects.toThrow(PipelineError);
    expect(creates).toEqual([]);
  });

  it('split tender books one payment per transaction, all to 100501', async () => {
    const plan = buildOrderPlan(loadOrder('gateway-shop-cash'));
    // #7201 carries channel-liable tax → configure the tax item for this test.
    const config: EngineConfig = { ...CONFIG, taxItems: { merchantLiable: 'tax-m', channelLiable: 'tax-c' } };
    const { ns, transforms } = fakeNs();
    const r = await runOrderPipeline(plan, ns, config);
    expect(r.nsPaymentIds).toHaveLength(2);
    const pays = transforms.filter((t) => t.to === 'customerpayment');
    expect(pays.map((p) => p.body.account.id)).toEqual(['1019', '1019']);
    const amounts = pays.map((p) => Math.round(p.body.payment * 100)).sort((a, b) => a - b);
    expect(amounts).toEqual([141, 4579]);
  });

  it('tax lines without a configured tax item stop the order loudly', async () => {
    const plan = buildOrderPlan(loadOrder('intl-vat-nl'));
    const unconfigured: EngineConfig = { ...CONFIG, taxItems: { merchantLiable: null, channelLiable: null } };
    const { ns, creates } = fakeNs();
    await expect(runOrderPipeline(plan, ns, unconfigured)).rejects.toThrow(/merchant-liable tax/);
    expect(creates).toEqual([]);
  });

  it('tax lines land on the INVOICE (not the SO), on the right item', async () => {
    const plan = buildOrderPlan(loadOrder('multi-tax-domestic'));
    const config: EngineConfig = { ...CONFIG, taxItems: { merchantLiable: 'tax-m', channelLiable: 'tax-c' } };
    const { ns, creates, transforms } = fakeNs();
    await runOrderPipeline(plan, ns, config);
    // SO: products only — NS forbids charge items on Sales Orders.
    const so = creates.find((c) => c.type === 'salesOrder')!;
    expect(so.payload.item.items.some((l: any) => String(l.item.id).startsWith('tax-'))).toBe(false);
    // Invoice transform body appends the exact tax lines, channel-liable → marketplace item.
    const inv = transforms.find((t) => t.to === 'invoice')!;
    const taxLines = inv.body.item.items;
    expect(taxLines).toHaveLength(2);
    expect(taxLines.every((l: any) => l.item.id === 'tax-c')).toBe(true);
    const taxSum = taxLines.reduce((s: number, l: any) => s + Math.round(l.amount * 100), 0);
    expect(taxSum).toBe(plan.totals.taxCents);
  });

  it('unknown gateway stops before any write', async () => {
    const plan = buildOrderPlan(loadOrder('b2c-latest'));
    plan.payments[0].gateway = 'mystery_gateway';
    const { ns, creates } = fakeNs();
    await expect(runOrderPipeline(plan, ns, CONFIG)).rejects.toThrow(/no clearing account/);
    expect(creates).toEqual([]);
  });
});

describe('engine config sanity', () => {
  it('covers every gateway observed in the store', () => {
    for (const gw of ['shopify_payments', 'shop_cash', 'paypal', 'Affirm']) {
      const norm = gw.trim().toLowerCase();
      expect(CONFIG.gatewayAccounts[norm], gw).toBeTruthy();
    }
  });
  it('fixture SKU set is non-trivial (fixtures loaded correctly)', () => {
    expect(fixtureSkus().size).toBeGreaterThan(5);
  });
});
