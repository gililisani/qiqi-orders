import { describe, expect, it } from 'vitest';
import { ensureRefunds } from '@/lib/shopify/engine/refund';
import { PipelineError, type NsApi } from '@/lib/shopify/engine/pipeline';
import { ENGINE_CONFIG } from '@/lib/shopify/engine/config';
import { buildOrderPlan } from '@/lib/shopify/core/orderTransform';
import { buildRefundPlans } from '@/lib/shopify/core/refundTransform';
import { loadOrder } from '../helpers/shopifyFixtures';

function fakeNs(existing: Record<string, string> = {}) {
  const creates: Array<{ type: string; payload: any }> = [];
  const transforms: Array<{ from: string; to: string; body: any }> = [];
  let nextId = 500;
  const ns: NsApi = {
    async findRecordIdByExternalId(type, extId) {
      return existing[`${type}:${extId}`] ?? null;
    },
    async createRecord(type, payload) {
      creates.push({ type, payload });
      return String(nextId++);
    },
    async updateRecord() {},
    async transformRecord(from, _fid, to, body) {
      transforms.push({ from, to, body });
      return String(nextId++);
    },
    async suiteQL() {
      return [];
    },
    async resolveItemIdsBySku(skus) {
      return new Map(skus.map((s) => [s, `item-${s}`]));
    },
  };
  return { ns, creates, transforms };
}

function load(name: string) {
  const order = loadOrder(name);
  return { orderPlan: buildOrderPlan(order), refunds: buildRefundPlans(order).plans };
}

describe('ensureRefunds', () => {
  it('cancelled-before-fulfillment (#7083): adjustment lines, no inventory, refund to same gateway', async () => {
    const { orderPlan, refunds } = load('refunded-full');
    const { ns, creates, transforms } = fakeNs();
    const r = await ensureRefunds(refunds, orderPlan, '999', ns, ENGINE_CONFIG, { orderHasNsFulfillment: false });
    expect(r.created).toEqual({ creditMemos: 1, refunds: 1 });

    const cm = creates.find((c) => c.type === 'creditMemo')!;
    expect(cm.payload.externalId).toMatch(/^SHOPCM-/);
    const lines = cm.payload.item.items;
    // Product line + shipping residual, both on the adjustment item.
    expect(lines).toHaveLength(2);
    expect(lines.every((l: any) => l.item.id === ENGINE_CONFIG.refundAdjustmentItemId)).toBe(true);
    expect(lines[0].description).toContain('FPS0020');
    expect(lines[1].description).toBe('Refunded shipping');
    const total = lines.reduce((s: number, l: any) => s + Math.round(l.amount * 100), 0);
    expect(total).toBe(3890); // $30 line + $8.90 shipping = full refund

    const rfd = transforms.find((t) => t.to === 'customerrefund')!;
    expect(rfd.from).toBe('creditMemo');
    expect(rfd.body.account.id).toBe('1019'); // shopify_payments → 100501
  });

  it('amount-only refund on a fulfilled order (#7084) books as adjustment', async () => {
    const { orderPlan, refunds } = load('refunded-partial');
    const { ns, creates } = fakeNs();
    const r = await ensureRefunds(refunds, orderPlan, '999', ns, ENGINE_CONFIG, { orderHasNsFulfillment: true });
    expect(r.created.creditMemos).toBe(1);
    const lines = creates[0].payload.item.items;
    expect(lines).toHaveLength(1);
    expect(Math.round(lines[0].amount * 100)).toBe(2990);
  });

  it('physical return (restock on a fulfilled order) parks for v2', async () => {
    const { orderPlan, refunds } = load('refunded-full');
    const { ns, creates } = fakeNs();
    await expect(
      ensureRefunds(refunds, orderPlan, '999', ns, ENGINE_CONFIG, { orderHasNsFulfillment: true }),
    ).rejects.toThrow(PipelineError);
    expect(creates).toEqual([]);
  });

  it('re-run adopts everything, creates nothing', async () => {
    const { orderPlan, refunds } = load('refunded-full');
    const existing = {
      [`creditMemo:SHOPCM-${refunds[0].shopifyRefundId}`]: '424029',
      [`customerrefund:SHOPRFD-${refunds[0].transactions[0].shopifyTransactionId}`]: '424132',
    };
    const { ns, creates, transforms } = fakeNs(existing);
    const r = await ensureRefunds(refunds, orderPlan, '999', ns, ENGINE_CONFIG, { orderHasNsFulfillment: false });
    expect(r.created).toEqual({ creditMemos: 0, refunds: 0 });
    expect(r.nsCreditMemoIds).toEqual(['424029']);
    expect(r.nsRefundIds).toEqual(['424132']);
    expect(creates).toEqual([]);
    expect(transforms).toEqual([]);
  });

  it('orders without refunds are a no-op', async () => {
    const { orderPlan, refunds } = load('b2b-latest');
    const { ns } = fakeNs();
    const r = await ensureRefunds(refunds, orderPlan, '999', ns, ENGINE_CONFIG);
    expect(r.created).toEqual({ creditMemos: 0, refunds: 0 });
  });

  it('CM location: sandbox config sets it, prod (null) omits it — NetScore prod CMs carry none', async () => {
    const { orderPlan, refunds } = load('refunded-full');

    const sandbox = fakeNs();
    await ensureRefunds(refunds, orderPlan, '999', sandbox.ns, ENGINE_CONFIG, { orderHasNsFulfillment: false });
    const sandboxCm = sandbox.creates.find((c) => c.type === 'creditMemo')!;
    expect(sandboxCm.payload.location).toEqual({ id: ENGINE_CONFIG.creditMemoLocationId });

    const prodlike = fakeNs();
    await ensureRefunds(
      refunds,
      orderPlan,
      '999',
      prodlike.ns,
      { ...ENGINE_CONFIG, creditMemoLocationId: null },
      { orderHasNsFulfillment: false },
    );
    const prodCm = prodlike.creates.find((c) => c.type === 'creditMemo')!;
    expect(prodCm.payload).not.toHaveProperty('location');
  });
});
