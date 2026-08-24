import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { buildStatementLines, buildGatewayStatementLines, renderOfx, renderOfxDocument } from '@/lib/shopify/core/statement';
import { buildPayoutPlan } from '@/lib/shopify/core/payoutTransform';
import type { ShopifyBalanceTxn, ShopifyPayoutNode } from '@/lib/shopify/core/payoutTransform';

const DIR = path.join(__dirname, '..', 'fixtures', 'shopify');
function load(id: string): { payout: ShopifyPayoutNode; txns: ShopifyBalanceTxn[] } {
  const list = JSON.parse(fs.readFileSync(path.join(DIR, 'payouts-list.json'), 'utf8'));
  return { payout: list.payouts.nodes.find((p: any) => p.legacyResourceId === id), txns: JSON.parse(fs.readFileSync(path.join(DIR, `payout-${id}-transactions.json`), 'utf8')) };
}

describe('100501 statement (Part 1 reconciliation)', () => {
  it('a complete payout nets to zero: every line that entered the balance also left it', () => {
    for (const id of ['124572958775', '124344991799', '124483305527']) {
      const { txns } = load(id);
      const lines = buildStatementLines(txns);
      expect(lines.reduce((s, l) => s + l.cents, 0)).toBe(0);
    }
  });

  it('mirrors the engine postings 1:1 — charge gross per order, fee/tax per payout, payout net', () => {
    const { payout, txns } = load('124572958775');
    const lines = buildStatementLines(txns);
    const { plan } = buildPayoutPlan(payout, txns);
    const charges = lines.filter((l) => l.name.startsWith('Shopify order '));
    expect(charges.length).toBe(txns.filter((t) => t.type === 'CHARGE').length);
    const c = charges.find((l) => l.orderName === '#7220')!;
    expect(c.cents).toBe(14390); // gross, what the engine's customer payment carries
    const fee = lines.find((l) => l.fitId === `fee-${payout.legacyResourceId}`)!;
    expect(fee.cents).toBe(-plan.totalFeeCents); // = the fee vendor-bill payment
    expect(fee.date).toBe('2026-08-15'); // store date of the TRANSFER (payout)
    const transfer = lines.find((l) => l.fitId === `payout-${payout.legacyResourceId}`)!;
    expect(transfer.cents).toBe(-plan.netCents); // = the journal's bank leg
    const tax = lines.find((l) => l.fitId === `tax-${payout.legacyResourceId}`)!;
    expect(tax.cents).toBe(plan.breakdown.filter((b) => b.type.startsWith('TAX_ADJUSTMENT')).reduce((s, b) => s + b.grossCents, 0));
    expect(lines.every((l) => l.cents !== 0)).toBe(true);
    expect(new Set(lines.map((l) => l.fitId)).size).toBe(lines.length); // FITIDs unique
  });

  it('payout-level lines take the payout ISSUE date when supplied (engine/bookkeeper journals are dated issuedAt, Shopify stamps the TRANSFER earlier)', () => {
    const { payout, txns } = load('124572958775');
    const lines = buildStatementLines(txns, { payoutDates: new Map([[payout.id, '2026-08-17']]) });
    for (const k of ['payout', 'fee', 'tax']) expect(lines.find((l) => l.fitId === `${k}-${payout.legacyResourceId}`)!.date).toBe('2026-08-17');
    expect(lines.find((l) => l.orderName === '#7220')!.date).toBe('2026-08-13'); // order lines keep their own date
  });

  it('window filter + test transactions excluded', () => {
    const { txns } = load('124572958775');
    const all = buildStatementLines(txns);
    const windowed = buildStatementLines(txns, { from: '2026-08-13', to: '2026-08-13' });
    expect(windowed.length).toBeGreaterThan(0);
    expect(windowed.length).toBeLessThan(all.length);
    expect(windowed.every((l) => l.date === '2026-08-13')).toBe(true);
    const withTest = buildStatementLines([{ ...txns[1], id: 'gid://x/1', test: true }]);
    expect(withTest).toEqual([]);
  });

  it('gateway lines (PayPal/Affirm Phase A): charge credit, refund debit, window filter, stable fitids', () => {
    const txns = [
      { id: '111', orderName: '#7300', kind: 'SALE', processedAt: '2026-08-20T14:00:00Z', amount: '208.90' },
      { id: '112', orderName: '#7300', kind: 'REFUND', processedAt: '2026-08-22T14:00:00Z', amount: '208.90' },
      { id: '113', orderName: '#7301', kind: 'CAPTURE', processedAt: '2026-08-25T14:00:00Z', amount: '50.00' },
      { id: '114', orderName: '#7302', kind: 'SALE', processedAt: '2026-08-21T14:00:00Z', amount: '0.00' },
    ];
    const lines = buildGatewayStatementLines(txns, { from: '2026-08-19', to: '2026-08-23' });
    expect(lines.map((l) => l.fitId)).toEqual(['gw-111', 'gw-112']); // #7301 outside window, zero-amount dropped
    expect(lines[0]).toMatchObject({ cents: 20890, trnType: 'CREDIT', name: 'Shopify order #7300', date: '2026-08-20' });
    expect(lines[1]).toMatchObject({ cents: -20890, trnType: 'DEBIT', name: 'Shopify refund #7300' });
  });

  it('multi-account document: ONE xml header, one STMTTRNRS per account (NetSuite concatenates chunks — regression for SSS_XML_DOM_EXCEPTION)', () => {
    const { txns } = load('124572958775');
    const shop = buildStatementLines(txns);
    const pp = buildGatewayStatementLines([{ id: '1', orderName: '#1', kind: 'SALE', processedAt: '2026-08-20T14:00:00Z', amount: '10.00' }]);
    const doc = renderOfxDocument([
      { acctId: 'shopify-payments', lines: shop, from: '2026-08-09', to: '2026-08-16' },
      { acctId: 'paypal', lines: pp, from: '2026-08-09', to: '2026-08-16' },
      { acctId: 'affirm', lines: [], from: '2026-08-09', to: '2026-08-16' },
    ], { now: new Date('2026-08-24T12:00:00Z') });
    expect((doc.match(/<\?xml/g) ?? []).length).toBe(1);
    expect((doc.match(/<STMTTRNRS>/g) ?? []).length).toBe(3);
    expect((doc.match(/<ACCTID>/g) ?? []).length).toBe(3);
    expect(doc).toContain('<ACCTID>paypal</ACCTID>');
    expect(doc.indexOf('<?xml')).toBe(0);
    expect((doc.match(/<STMTTRN>/g) ?? []).length).toBe(shop.length + 1);
  });

  it('renders OFX 2.x the NetSuite parser accepts: header, account, one STMTTRN per line, escaped text', () => {
    const { txns } = load('124572958775');
    const lines = buildStatementLines(txns);
    const ofx = renderOfx(lines, { from: '2026-08-09', to: '2026-08-16', ledgerBalanceCents: 12345, now: new Date('2026-08-23T12:00:00Z') });
    expect(ofx.startsWith('<?xml version="1.0"')).toBe(true);
    expect(ofx).toContain('<?OFX OFXHEADER="200" VERSION="211"');
    expect(ofx).toContain('<BANKID>SHOPIFY</BANKID><ACCTID>shopify-payments</ACCTID>');
    expect((ofx.match(/<STMTTRN>/g) ?? []).length).toBe(lines.length);
    expect(ofx).toContain('<TRNAMT>143.90</TRNAMT>');
    expect(ofx).toContain('<BALAMT>123.45</BALAMT>');
    expect(ofx).toContain('<DTSTART>20260809120000</DTSTART>');
    expect(ofx).not.toMatch(/<NAME>[^<]*&(?!amp;|lt;|gt;)/);
  });
});
