import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { renderShopifyReportCsv, renderPaypalReportCsv, renderAffirmReportCsv, monthWindow } from '@/lib/shopify/reports';
import type { ShopifyBalanceTxn } from '@/lib/shopify/core/payoutTransform';
import type { AffirmEvent } from '@/lib/shopify/gateways/affirm';

const DIR = path.join(__dirname, '..', 'fixtures', 'shopify');

describe('finance reports (CPA verification layer)', () => {
  it('Shopify CSV: one row per balance transaction in window, payout date resolved, test txns excluded', () => {
    const txns: ShopifyBalanceTxn[] = JSON.parse(fs.readFileSync(path.join(DIR, 'payout-124572958775-transactions.json'), 'utf8'));
    const payoutDates = new Map([['gid://shopify/ShopifyPaymentsPayout/124572958775', '2026-08-17']]);
    const csv = renderShopifyReportCsv(txns, payoutDates, { from: '2026-08-01', to: '2026-08-31' });
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('Transaction Date,Type,Order,Amount,Fee,Net,Payout Date,Payout ID,Transaction ID');
    expect(lines.length).toBe(1 + txns.filter((t) => !t.test).length);
    expect(csv).toContain('#7220');
    expect(csv).toContain('2026-08-17,124572958775');
  });

  it('PayPal CSV: readable types, net computed, window filtered', () => {
    const csv = renderPaypalReportCsv([
      { transactionId: 'A', eventCode: 'T0006', date: '2026-08-05T10:00:00Z', status: 'S', amount: '108.90', fee: '-5.92', invoiceId: 'inv1' },
      { transactionId: 'W', eventCode: 'T0403', date: '2026-08-21T10:00:00Z', status: 'S', amount: '-1000.00', fee: '0', invoiceId: null },
      { transactionId: 'H', eventCode: 'T1110', date: '2026-08-21T10:00:00Z', status: 'P', amount: '-278.00', fee: '0', invoiceId: null },
      { transactionId: 'OLD', eventCode: 'T0006', date: '2026-07-05T10:00:00Z', status: 'S', amount: '1.00', fee: '0', invoiceId: null },
    ], { from: '2026-08-01', to: '2026-08-31' });
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(4); // header + 3 (OLD filtered)
    expect(lines[1]).toBe('2026-08-05,T0006,Payment,S,108.90,-5.92,102.98,A,inv1');
    expect(csv).toContain('Withdrawal to bank');
    expect(csv).toContain('Hold/Reserve/Dispute');
  });

  it('Affirm CSV: column-for-column the portal settlement report, cents → dollars, portal event names', () => {
    const e: AffirmEvent = { id: 'x', date: '2026-08-20', eventType: 'loan_capture', salesCents: 39730, refundsCents: 0, feesCents: -2410, totalSettledCents: 37320, depositId: '826VV9TG92X4O41', transactionId: 'y5GE8avLEHJsCKxq', orderId: 'ro8KTx7BtTlr4lrrN2VaNmoUP', purchaseId: 'K3XS-HI8K', chargeCreatedDate: '2026-08-19', transactionFeesCents: -30, originalLoanAmountCents: 39730, mdr: 0.0599, channel: 'Affirm Direct', merchantAri: 'HV7933BTF9S8GEWN', currency: 'USD' };
    const csv = renderAffirmReportCsv([e], { from: '2026-08-01', to: '2026-08-31' });
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('date,charge_created_date,charge_id,transaction_id,order_id,event_type,sales,refunds,fees,total_settled,txn_fees,deposit_id,merchant_ari,city,store,card_last_four,original_loan_amount,mdr_rate,channel');
    expect(lines[1]).toBe('2026-08-20,2026-08-19,K3XS-HI8K,y5GE8avLEHJsCKxq,ro8KTx7BtTlr4lrrN2VaNmoUP,loan_captured,397.30,0.00,-24.10,373.20,-0.30,826VV9TG92X4O41,HV7933BTF9S8GEWN,,,,397.30,0.059900,Affirm Direct');
  });

  it('monthWindow: correct month ends incl. February', () => {
    expect(monthWindow('2026-01')).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(monthWindow('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(() => monthWindow('2026-13-01' as any)).toThrow();
  });
});
