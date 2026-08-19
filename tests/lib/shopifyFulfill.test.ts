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
});
