import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { ensurePayoutBooking } from '@/lib/shopify/engine/payouts';
import { PipelineError, type NsApi } from '@/lib/shopify/engine/pipeline';
import { ENGINE_CONFIG, type EngineConfig } from '@/lib/shopify/engine/config';
import type { ShopifyBalanceTxn, ShopifyPayoutNode } from '@/lib/shopify/core/payoutTransform';

const DIR = path.join(__dirname, '..', 'fixtures', 'shopify');

function loadPayout(id: string): { payout: ShopifyPayoutNode; txns: ShopifyBalanceTxn[] } {
  const list = JSON.parse(fs.readFileSync(path.join(DIR, 'payouts-list.json'), 'utf8'));
  const payout = list.payouts.nodes.find((p: any) => p.legacyResourceId === id);
  const txns = JSON.parse(fs.readFileSync(path.join(DIR, `payout-${id}-transactions.json`), 'utf8'));
  return { payout, txns };
}

function fakeNs(existing: Record<string, string> = {}) {
  const creates: Array<{ type: string; payload: any }> = [];
  const transforms: Array<{ from: string; to: string; body: any }> = [];
  let nextId = 900;
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
    async suiteQL() { return []; },
    async resolveItemIdsBySku() { return new Map(); },
  };
  return { ns, creates, transforms };
}

describe('ensurePayoutBooking (real payout fixtures)', () => {
  it('big Monday payout: fee bill to Shopify vendor, payment from 100501, balanced journal with tax leg', async () => {
    const { payout, txns } = loadPayout('124572958775');
    const { ns, creates, transforms } = fakeNs();
    const r = await ensurePayoutBooking(payout, txns, ns, ENGINE_CONFIG);
    expect(r.created).toEqual({ bill: true, payment: true, journal: true });

    const bill = creates.find((c) => c.type === 'vendorBill')!;
    expect(bill.payload.entity.id).toBe('69810');
    expect(bill.payload.expense.items.every((l: any) => l.account.id === '1859')).toBe(true);
    const billTotal = bill.payload.expense.items.reduce((s: number, l: any) => s + Math.round(l.amount * 100), 0);
    expect(billTotal).toBe(r.plan.totalFeeCents);

    const pay = transforms.find((t) => t.to === 'vendorPayment')!;
    expect(pay.body.account.id).toBe('1019'); // paid from the Shopify clearing account

    const journal = creates.find((c) => c.type === 'journalEntry')!;
    const lines = journal.payload.line.items;
    const debit = lines.reduce((s: number, l: any) => s + Math.round((l.debit ?? 0) * 100), 0);
    const credit = lines.reduce((s: number, l: any) => s + Math.round((l.credit ?? 0) * 100), 0);
    expect(debit).toBe(credit); // balanced
    const bankLeg = lines.find((l: any) => l.account.id === '938')!;
    expect(Math.round(bankLeg.debit * 100)).toBe(r.plan.netCents);
    // This payout carries a Shop-remitted tax deduction → marketplace leg.
    expect(lines.some((l: any) => l.account.id === '1573')).toBe(true);
  });

  it('negative payout (refund-only): bank leg is a CREDIT (Shopify withdraws)', async () => {
    const { payout, txns } = loadPayout('124483305527');
    const { ns, creates } = fakeNs();
    const r = await ensurePayoutBooking(payout, txns, ns, ENGINE_CONFIG);
    expect(r.nsFeeBillId).toBeNull(); // no fees on a refund-only payout
    const journal = creates.find((c) => c.type === 'journalEntry')!;
    const bankLeg = journal.payload.line.items.find((l: any) => l.account.id === '938')!;
    expect(Math.round(bankLeg.credit * 100)).toBe(2990);
  });

  it('dispute payout parks until the chargeback account exists, books once configured', async () => {
    const { payout, txns } = loadPayout('124344991799');
    const { ns } = fakeNs();
    await expect(ensurePayoutBooking(payout, txns, ns, ENGINE_CONFIG)).rejects.toThrow(PipelineError);

    const configured: EngineConfig = {
      ...ENGINE_CONFIG,
      payouts: { ...ENGINE_CONFIG.payouts, chargebackAccountId: 'cb-acct' },
    };
    const { ns: ns2, creates } = fakeNs();
    const r = await ensurePayoutBooking(payout, txns, ns2, configured);
    const journal = creates.find((c) => c.type === 'journalEntry')!;
    expect(journal.payload.line.items.some((l: any) => l.account.id === 'cb-acct')).toBe(true);
    const debit = journal.payload.line.items.reduce((s: number, l: any) => s + Math.round((l.debit ?? 0) * 100), 0);
    const credit = journal.payload.line.items.reduce((s: number, l: any) => s + Math.round((l.credit ?? 0) * 100), 0);
    expect(debit).toBe(credit);
    expect(r.plan.disputes).toHaveLength(2);
  });

  it('100501 nets to ZERO per payout even with a lone dispute fee (regression: dispute fee was counted in the fee bill AND the dispute leg)', async () => {
    // Synthetic payout: one charge + one dispute withdrawal whose $15 fee does not cancel out.
    const pid = 'gid://shopify/ShopifyPaymentsPayout/1';
    const txns: ShopifyBalanceTxn[] = [
      { id: 'gid://x/1', transactionDate: '2026-08-10T10:00:00Z', type: 'CHARGE', test: false, amount: { amount: '1000.00' }, fee: { amount: '30.00' }, net: { amount: '970.00' }, sourceId: null, sourceType: null, adjustmentReason: null, associatedOrder: { id: 'gid://shopify/Order/1', name: '#1' }, associatedPayout: { id: pid } },
      { id: 'gid://x/2', transactionDate: '2026-08-10T11:00:00Z', type: 'DISPUTE_WITHDRAWAL', test: false, amount: { amount: '-186.00' }, fee: { amount: '15.00' }, net: { amount: '-201.00' }, sourceId: null, sourceType: null, adjustmentReason: null, associatedOrder: { id: 'gid://shopify/Order/2', name: '#2' }, associatedPayout: { id: pid } },
      { id: 'gid://x/3', transactionDate: '2026-08-11T01:00:00Z', type: 'TRANSFER', test: false, amount: { amount: '-769.00' }, fee: { amount: '0.0' }, net: { amount: '-769.00' }, sourceId: '1', sourceType: 'TRANSFER', adjustmentReason: null, associatedOrder: null, associatedPayout: { id: pid } },
    ];
    const payout: ShopifyPayoutNode = { id: pid, legacyResourceId: '1', issuedAt: '2026-08-11T01:00:00Z', status: 'PAID', net: { amount: '769.00' }, summary: {} as any };
    const configured: EngineConfig = { ...ENGINE_CONFIG, payouts: { ...ENGINE_CONFIG.payouts, chargebackAccountId: 'cb-acct' } };
    const { ns, creates, transforms } = fakeNs();
    await ensurePayoutBooking(payout, txns, ns, configured);
    const clearing = ENGINE_CONFIG.gatewayAccounts.shopify_payments;
    // What leaves 100501: fee bill payment (Σ fees) + the journal's clearing lines.
    expect(transforms.some((t) => t.to === 'vendorPayment')).toBe(true); // fee bill paid from 100501 in full
    const bill = creates.find((c) => c.type === 'vendorBill')!;
    const feeCents = Math.round(bill.payload.expense.items.reduce((s: number, l: any) => s + Number(l.amount), 0) * 100);
    const journal = creates.find((c) => c.type === 'journalEntry')!;
    const clearingLines = journal.payload.line.items.filter((l: any) => l.account.id === clearing);
    const clearingCredit = clearingLines.reduce((s: number, l: any) => s + Math.round((l.credit ?? 0) * 100) - Math.round((l.debit ?? 0) * 100), 0);
    expect(feeCents).toBe(4500); // 30 + 15
    expect(100000 - feeCents - clearingCredit).toBe(0); // gross charge in − fees − clearing = 0
    // chargeback leg is GROSS (186), not net (201)
    expect(journal.payload.line.items.find((l: any) => l.account.id === 'cb-acct').debit).toBe(186);
    // the clearing side is split per statement piece: payout net + disputes
    expect(clearingLines.map((l: any) => l.memo)).toEqual(['Clear Shopify balance · payout 1 net', 'Clear Shopify balance · payout 1 disputes']);
  });

  it('re-run adopts all records, creates nothing', async () => {
    const { payout, txns } = loadPayout('124145598519');
    const id = payout.legacyResourceId;
    const existing = {
      [`vendorBill:SHOPPO-FEE-${id}`]: '424417',
      [`vendorPayment:SHOPPO-FEEPAY-${id}`]: '424418',
      [`journalEntry:SHOPPO-NET-${id}`]: '424085',
    };
    const { ns, creates, transforms } = fakeNs(existing);
    const r = await ensurePayoutBooking(payout, txns, ns, ENGINE_CONFIG);
    expect(r.created).toEqual({ bill: false, payment: false, journal: false });
    expect(creates).toEqual([]);
    expect(transforms).toEqual([]);
  });
});
