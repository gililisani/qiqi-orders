import { describe, expect, it } from 'vitest';
import { buildPaymentAccounts, buildVendorProfiles, cardLast4, memoLabel, type BillLineRow } from '@/lib/ap/learn';

const header = (id: string, entity: string, total: number, memo: string, date = '04/10/2026', extra: Partial<BillLineRow> = {}): BillLineRow => ({
  id, entity, trandate: date, currency_name: 'USD', foreigntotal: -total, memo,
  mainline: 'T', taxline: 'F', expenseaccount: '210100', account_name: '210100 Account Payable',
  subsidiary: '3', subsidiary_name: 'Qiqi INC.', department: null, department_name: null, class: null, class_name: null,
  location: null, location_name: null, taxcode: null, taxcode_name: null, item: null, ...extra,
});
const line = (id: string, entity: string, account: string, dept: string | null = null, extra: Partial<BillLineRow> = {}): BillLineRow => ({
  ...header(id, entity, 0, ''), mainline: 'F', expenseaccount: account, account_name: `${account} Expense`,
  department: dept, department_name: dept ? `Dept ${dept}` : null, ...extra,
});

describe('memoLabel', () => {
  it('drops the period from "<Vendor> MM.YY"', () => {
    expect(memoLabel('Supabase 09.26')).toBe('Supabase');
    expect(memoLabel('Vercel Inc 09/2026')).toBe('Vercel Inc');
    expect(memoLabel('Klaviyo - Oct 2026')).toBe('Klaviyo');
    expect(memoLabel('Upwork')).toBe('Upwork');
    expect(memoLabel('')).toBeNull();
  });
});

describe('cardLast4', () => {
  it('reads the last standalone 4 digits of a card account name', () => {
    expect(cardLast4('IDB Qiqi INC Visa 5335')).toBe('5335');
    expect(cardLast4('Mastercard Poalim 4223 USD')).toBe('4223');
    expect(cardLast4('Mizrahi QIQI LTD 038885 (ILS)')).toBeNull();
    expect(cardLast4('Amex')).toBeNull();
  });
});

describe('buildVendorProfiles', () => {
  it('learns coding, payment account, memo label and amounts per vendor', () => {
    const rows = [
      header('1', '10', 34.35, 'Supabase 09.26', '04/10/2026'), line('1', '10', '622010', '7'),
      header('2', '10', 25, 'Supabase 08.26', '04/09/2026'), line('2', '10', '622010', '7'),
      header('3', '10', 30, 'Supabase 07.26', '04/08/2026'), line('3', '10', '622010', '7'),
      header('4', '20', 60, 'Vercel 09.26'), line('4', '20', '615010'),
      header('5', '20', 120, 'Vercel 08.26'), line('5', '20', '622020', '9'),
    ];
    const payments = [
      { entity: '10', account: '2001', account_name: '220301 IDB Qiqi INC Visa 5335' },
      { entity: '10', account: '2001', account_name: '220301 IDB Qiqi INC Visa 5335' },
      { entity: '20', account: '938', account_name: '100101 IDB QIQINC (USD)' },
    ];
    const vendors = [
      { id: '10', entityid: 'V5312', companyname: 'Supabase Pte. Ltd', email: 'Billing@Supabase.io ' },
      { id: '20', entityid: 'V5289', companyname: 'Vercel Inc', email: null },
    ];
    const [supabase, vercel] = buildVendorProfiles(rows, payments, vendors);

    expect(supabase).toMatchObject({
      ns_vendor_id: '10',
      vendor_name: 'Supabase Pte. Ltd',
      subsidiary_id: '3',
      currency: 'USD',
      ap_account_id: '210100',
      payment_account_id: '2001',
      memo_label: 'Supabase',
      bill_count: 3,
      consistency: 1,
      amount_median: 30,
      amount_min: 25,
      amount_max: 34.35,
      last_bill_date: '2026-10-04',
      sender_emails: ['billing@supabase.io'],
      aliases: ['Supabase Pte. Ltd', 'V5312'],
    });
    expect(supabase.codings).toHaveLength(1);
    expect(supabase.codings[0]).toMatchObject({ account_id: '622010', department_id: '7', share: 1, item_based: false });

    // Booked two different ways → both codings kept, consistency 50%.
    expect(vercel.consistency).toBe(0.5);
    expect(vercel.codings.map((c) => c.account_id).sort()).toEqual(['615010', '622020']);
    expect(vercel.payment_account_id).toBe('938');
  });

  it('follows how the vendor is booked now, not its oldest bills', () => {
    const rows = [
      // Booked to 622020 for a year, then moved to 615010.
      ...['01/01/2026', '01/02/2026', '01/03/2026', '01/04/2026', '01/05/2026', '01/06/2026'].flatMap((d, i) => [
        header(`old${i}`, '20', 60, `Vercel ${d.slice(3, 5)}.26`, d), line(`old${i}`, '20', '622020'),
      ]),
      ...['01/07/2026', '01/08/2026', '01/09/2026', '01/10/2026'].flatMap((d, i) => [
        header(`new${i}`, '20', 60, `Vercel ${d.slice(3, 5)}.26`, d), line(`new${i}`, '20', '615010'),
      ]),
    ];
    const payments = [
      { entity: '20', trandate: '01/01/2026', account: '938', account_name: 'bank' },
      { entity: '20', trandate: '01/02/2026', account: '938', account_name: 'bank' },
      { entity: '20', trandate: '01/03/2026', account: '938', account_name: 'bank' },
      { entity: '20', trandate: '01/09/2026', account: '2001', account_name: 'card' },
      { entity: '20', trandate: '01/10/2026', account: '2001', account_name: 'card' },
    ];
    const [p] = buildVendorProfiles(rows, payments, []);
    expect(p.codings[0]).toMatchObject({ account_id: '615010', last_used: '2026-10-01' });
    expect(p.consistency).toBeCloseTo(4 / 6);
    expect(p.payment_account_id).toBe('2001');
    expect(p.memo_label).toBe('Vercel');
  });

  it('free-text memos fall back to the vendor name', () => {
    const rows = [
      header('1', '40', 5000, 'Manufacturing FPS0018'), line('1', '40', '621020'),
      header('2', '40', 5000, 'Additional Qty for PO123'), line('2', '40', '621020'),
      header('3', '40', 5000, '10k units of component'), line('3', '40', '621020'),
    ];
    const [p] = buildVendorProfiles(rows, [], [{ id: '40', entityid: 'V5213', companyname: 'Biogenesis Labs', email: null }]);
    expect(p.memo_label).toBe('Biogenesis Labs');
  });

  it('marks item-based bills and ignores tax lines', () => {
    const rows = [
      header('1', '30', 100, 'Factory 09.26'),
      line('1', '30', '500010', null, { item: '1040' }),
      line('1', '30', '101402', null, { taxline: 'T' }),
    ];
    const [p] = buildVendorProfiles(rows, [], []);
    expect(p.codings).toHaveLength(1);
    expect(p.codings[0].item_based).toBe(true);
    expect(p.vendor_name).toBe('30');
  });
});

describe('buildPaymentAccounts', () => {
  it('keeps every card plus the banks that paid bills, most used first', () => {
    const accounts = [
      { id: '2001', acctnumber: '220301', name: 'IDB Qiqi INC Visa 5335', accttype: 'CredCard', currency_name: 'USD' },
      { id: '2002', acctnumber: '220202', name: 'Mastercard Poalim 4223 USD', accttype: 'CredCard', currency_name: 'USD' },
      { id: '938', acctnumber: '100101', name: 'IDB QIQINC (USD)', accttype: 'Bank', currency_name: 'USD' },
      { id: '361', acctnumber: '100502', name: 'Stripe - QIQI INC (USD)', accttype: 'Bank', currency_name: 'USD' },
    ];
    const payments = [
      { entity: '10', account: '2001', account_name: null },
      { entity: '10', account: '2001', account_name: null },
      { entity: '20', account: '938', account_name: null },
    ];
    const out = buildPaymentAccounts(accounts, payments);
    expect(out.map((a) => a.ns_account_id)).toEqual(['2001', '938', '2002']);
    expect(out[0]).toMatchObject({ type: 'card', last4: '5335', uses: 2, name: '220301 IDB Qiqi INC Visa 5335' });
    expect(out[1]).toMatchObject({ type: 'bank', last4: null, uses: 1 });
    expect(out[2]).toMatchObject({ type: 'card', last4: '4223', uses: 0 });
  });
});
