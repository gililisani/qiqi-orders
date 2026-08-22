import { describe, expect, it } from 'vitest';
import { ensureItemFulfillments } from '@/lib/shopify/engine/fulfill';
import { PipelineError, type NsApi } from '@/lib/shopify/engine/pipeline';
import { ENGINE_CONFIG } from '@/lib/shopify/engine/config';
import type { FulfillmentPlan } from '@/lib/shopify/core/fulfillmentTransform';

const PLAN: FulfillmentPlan = {
  shopifyFulfillmentId: '900',
  shopifyOrderId: '7000000000001',
  orderName: '#9999',
  createdAt: '2026-08-15T12:00:00Z',
  tracking: [{ carrier: 'DHL eCommerce', number: 'TRK1', url: null }],
  lines: [{ sku: 'FPS0025', shopifyLineItemId: '1', quantity: 5 }],
};

function fakeNs(opts: {
  soLines?: any[];
  lots?: any[];
  existingIf?: string | null;
  lotItem?: boolean;
  plainStock?: number;
}) {
  const transforms: Array<{ to: string; body: any }> = [];
  const ns: NsApi = {
    async findRecordIdByExternalId(type, extId) {
      return type === 'itemFulfillment' ? opts.existingIf ?? null : null;
    },
    async createRecord() {
      throw new Error('unused');
    },
    async updateRecord() {},
    async transformRecord(_f, _fid, to, body) {
      transforms.push({ to, body });
      return '777';
    },
    async suiteQL(q: string) {
      if (q.includes('FROM transactionline')) return (opts.soLines ?? []) as any;
      if (q.includes('FROM inventorynumber inv')) return (opts.lots ?? []) as any;
      if (q.includes('islotitem FROM item')) return [{ id: 'item-42', islotitem: opts.lotItem === false ? 'F' : 'T' }] as any;
      if (q.includes('FROM aggregateitemlocation')) return [{ quantityavailable: String(opts.plainStock ?? 0) }] as any;
      return [];
    },
    async resolveItemIdsBySku(skus) {
      return new Map(skus.map((s) => [s, 'item-42']));
    },
  };
  return { ns, transforms };
}

const SO_LINES = [{ id: '1', item: 'item-42', quantity: '-5', itemtype: 'Assembly' }];

describe('ensureItemFulfillments', () => {
  it('creates an IF with FEFO lots spanning batches (oldest lot number first)', async () => {
    const { ns, transforms } = fakeNs({
      soLines: SO_LINES,
      lots: [
        { id: '10', inventorynumber: '560100', quantityavailable: '2', expirationdate: null },
        { id: '11', inventorynumber: '560200', quantityavailable: '99', expirationdate: null },
      ],
    });
    const r = await ensureItemFulfillments([PLAN], '423000', ns, ENGINE_CONFIG);
    expect(r).toMatchObject({ created: 1, nsFulfillmentIds: ['777'] });
    const body = transforms[0].body;
    expect(body.externalId).toBe('SHOPFUL-900');
    expect(body.shipStatus).toEqual({ id: 'C' });
    expect(body.memo).toContain('TRK1');
    const line = body.item.items[0];
    expect(line.orderLine).toBe(1);
    expect(line.location).toEqual({ id: ENGINE_CONFIG.fulfillmentLocationId });
    // 5 needed: 2 from the older lot, 3 from the next.
    expect(line.inventoryDetail.inventoryAssignment.items).toEqual([
      { issueInventoryNumber: { id: '10' }, quantity: 2 },
      { issueInventoryNumber: { id: '11' }, quantity: 3 },
    ]);
  });

  it('adopts an existing IF without transforming', async () => {
    const { ns, transforms } = fakeNs({ existingIf: '555' });
    const r = await ensureItemFulfillments([PLAN], '423000', ns, ENGINE_CONFIG);
    expect(r).toMatchObject({ created: 0, nsFulfillmentIds: ['555'] });
    expect(transforms).toEqual([]);
  });

  it('insufficient lot stock parks the order loudly, no IF created', async () => {
    const { ns, transforms } = fakeNs({
      soLines: SO_LINES,
      lots: [{ id: '10', inventorynumber: '560100', quantityavailable: '1', expirationdate: null }],
    });
    await expect(ensureItemFulfillments([PLAN], '423000', ns, ENGINE_CONFIG)).rejects.toThrow(PipelineError);
    expect(transforms).toEqual([]);
  });

  it('a fulfilled SKU with no matching SO line errors', async () => {
    const { ns } = fakeNs({ soLines: [], lots: [] });
    await expect(ensureItemFulfillments([PLAN], '423000', ns, ENGINE_CONFIG)).rejects.toThrow(/no matching SO line/);
  });

  it('no fulfillment plans → no-op', async () => {
    const { ns } = fakeNs({});
    const r = await ensureItemFulfillments([], '423000', ns, ENGINE_CONFIG);
    expect(r).toEqual({ nsFulfillmentIds: [], created: 0 });
  });

  it('CSF + RESTlet configured: fulfills via the RESTlet with FEFO lots (no REST transform)', async () => {
    const { ns, transforms } = fakeNs({
      soLines: SO_LINES,
      lots: [{ id: '471', inventorynumber: '560345', quantityavailable: '247', expirationdate: null }],
    });
    const calls: any[] = [];
    ns.restletFulfillConfigured = () => true;
    ns.restletFulfillOrder = async (payload) => {
      calls.push(payload);
      return '598652';
    };
    const csf = { ...ENGINE_CONFIG, crossSubsidiaryFulfillment: true, fulfillmentLocationId: '46' };
    const r = await ensureItemFulfillments([PLAN], '598252', ns, csf);
    expect(r).toMatchObject({ created: 1, nsFulfillmentIds: ['598652'] });
    expect(transforms).toHaveLength(0); // REST transform never touched
    expect(calls[0]).toMatchObject({
      salesOrderId: '598252',
      externalId: 'SHOPFUL-900',
      shipStatus: 'C',
      lines: [{ orderLine: 1, quantity: 5, locationId: '46', lots: [{ id: '471', quantity: 5 }] }],
    });
    expect(calls[0].memo).toContain('TRK1');
  });

  it('CSF without the RESTlet parks loudly instead of hitting the broken REST transform', async () => {
    const { ns, transforms } = fakeNs({
      soLines: SO_LINES,
      lots: [{ id: '471', inventorynumber: '560345', quantityavailable: '247', expirationdate: null }],
    });
    const csf = { ...ENGINE_CONFIG, crossSubsidiaryFulfillment: true, fulfillmentLocationId: '46' };
    await expect(ensureItemFulfillments([PLAN], '598252', ns, csf)).rejects.toThrow(/fulfill RESTlet/);
    expect(transforms).toHaveLength(0);
  });

  it('non-lot item (Heat Cap #6604): plain stock check, IF line carries NO inventory detail', async () => {
    const { ns, transforms } = fakeNs({ soLines: SO_LINES, lots: [], lotItem: false, plainStock: 184 });
    const r = await ensureItemFulfillments([PLAN], '423000', ns, ENGINE_CONFIG);
    expect(r.created).toBe(1);
    const line = transforms[0].body.item.items[0];
    expect(line.inventoryDetail).toBeUndefined();
    expect(line.quantity).toBe(5);
  });

  it('non-lot item with no stock at the location parks loudly', async () => {
    const { ns } = fakeNs({ soLines: SO_LINES, lots: [], lotItem: false, plainStock: 0 });
    await expect(ensureItemFulfillments([PLAN], '423000', ns, ENGINE_CONFIG)).rejects.toThrow(/insufficient stock/);
  });

  it('same SKU on two Shopify lines (#6604 FPS0024 ×1 and ×2) maps to two distinct SO lines', async () => {
    const plan: FulfillmentPlan = {
      ...PLAN,
      lines: [
        { sku: 'FPS0025', shopifyLineItemId: 'a', quantity: 2 },
        { sku: 'FPS0025', shopifyLineItemId: 'b', quantity: 1 },
      ],
    };
    const { ns, transforms } = fakeNs({
      soLines: [
        { id: '5', item: 'item-42', quantity: '-1', itemtype: 'Assembly' },
        { id: '6', item: 'item-42', quantity: '-2', itemtype: 'Assembly' },
      ],
      lots: [{ id: '10', inventorynumber: '560100', quantityavailable: '99', expirationdate: null }],
    });
    await ensureItemFulfillments([plan], '423000', ns, ENGINE_CONFIG);
    const lines = transforms[0].body.item.items;
    expect(lines.map((l: any) => [l.orderLine, l.quantity])).toEqual([[6, 2], [5, 1]]);
  });
});
