import { describe, expect, it } from 'vitest';
import { baseDomain, normalizeName, pickVendor, rankVendors } from '@/lib/ap/match';
import { billMemo, buildProposal, canApprove, runChecks, type ProposalProfile } from '@/lib/ap/propose';
import { normalizeExtraction, type InvoiceExtraction } from '@/lib/ap/reader/schema';

const extraction = (over: Partial<InvoiceExtraction> = {}): InvoiceExtraction => ({
  is_invoice: true,
  document_type: 'invoice',
  vendor: { name: 'Supabase Pte. Ltd', name_latin: null, tax_id: null, email: 'billing@supabase.io', website: null, country: 'SG' },
  bill_to: { name: 'Qiqi Inc.', country: 'US' },
  invoice_number: 'RACPIO-00018',
  invoice_date: '2026-11-04',
  due_date: '2026-11-04',
  currency: 'USD',
  service_period: { from: '2026-10-01', to: '2026-10-31' },
  lines: [{ description: 'Pro plan', quantity: 1, unit_price: 25, amount: 25, tax_rate_percent: null }, { description: 'Compute', quantity: null, unit_price: null, amount: 9.35, tax_rate_percent: null }],
  subtotal: 34.35,
  tax_lines: [],
  tax_total: 0,
  total: 34.35,
  amount_paid: 34.35,
  amount_due: 0,
  payment: { status: 'paid', method: 'card', card_brand: 'Visa', card_last4: '5335', paid_date: '2026-11-04' },
  language: 'en',
  warnings: [],
  ...over,
});

const supabase: ProposalProfile & { aliases: string[]; sender_emails: string[]; subsidiary_name: string } = {
  ns_vendor_id: '122813',
  vendor_name: 'Supabase Pte. Ltd',
  aliases: ['Supabase Pte. Ltd', 'V5312'],
  sender_emails: [],
  subsidiary_id: '3',
  subsidiary_name: 'Qiqi INC.',
  currency: 'USD',
  ap_account_id: '210101',
  codings: [{ account_id: '622010', account_name: '622010 Website development & maintenance', department_id: '7', department_name: 'Marketing', class_id: null, class_name: null, location_id: null, location_name: null, taxcode_id: null, taxcode_name: null, item_based: false, share: 1, last_used: '2026-10-04' }],
  payment_account_id: '2001',
  payment_account_name: '220301 IDB Qiqi INC Visa 5335',
  memo_label: 'Supabase',
  bill_count: 9,
  amount_min: 25,
  amount_max: 40,
};

const cards = [
  { ns_account_id: '2001', name: '220301 IDB Qiqi INC Visa 5335', type: 'card' as const, last4: '5335', currency: 'USD' },
  { ns_account_id: '2002', name: '220202 Mastercard Poalim 4223 USD', type: 'card' as const, last4: '4223', currency: 'USD' },
  { ns_account_id: '2003', name: '220201 Mastercard Poalim 4223 ILS', type: 'card' as const, last4: '4223', currency: 'ILS' },
];

describe('vendor matching', () => {
  it('normalizes names and domains', () => {
    expect(normalizeName('Supabase Pte. Ltd')).toBe('supabase');
    expect(normalizeName('V5289 Vercel Inc')).toBe('vercel');
    expect(baseDomain('billing@mail.supabase.io')).toBe('supabase.io');
    expect(baseDomain('https://www.example.co.il/x')).toBe('example.co.il');
  });

  it('matches by name, by known sender, and stays unsure when two vendors tie', () => {
    const vercel = { ...supabase, ns_vendor_id: '1', vendor_name: 'Vercel Inc', aliases: [], memo_label: 'Vercel Inc', sender_emails: ['invoices@vercel.com'] };
    const ranked = rankVendors(extraction(), null, [supabase, vercel]);
    expect(pickVendor(ranked)?.ns_vendor_id).toBe('122813');

    const bySender = rankVendors(extraction({ vendor: { ...extraction().vendor, name: 'Unknown Co' } }), 'invoices@vercel.com', [supabase, vercel]);
    expect(pickVendor(bySender)).toMatchObject({ ns_vendor_id: '1', score: 100 });

    const twin = { ...supabase, ns_vendor_id: '999' };
    expect(pickVendor(rankVendors(extraction(), null, [supabase, twin]))).toBeNull();
  });

  it('a free-mail sender proves nothing', () => {
    const gmailVendor = { ...supabase, ns_vendor_id: '5', vendor_name: 'Someone Else', aliases: [], memo_label: null, sender_emails: ['other@gmail.com'] };
    const ranked = rankVendors(extraction({ vendor: { ...extraction().vendor, name: 'Brand New Vendor', email: null } }), 'billing@gmail.com', [gmailVendor]);
    expect(ranked).toEqual([]);
  });
});

describe('bill proposal', () => {
  it('books it the way the vendor is always booked, paid from the card on the invoice', () => {
    const p = buildProposal(extraction(), supabase, cards);
    expect(p).toMatchObject({
      ns_vendor_id: '122813',
      subsidiary_id: '3',
      tranid: 'RACPIO-00018',
      trandate: '2026-11-04',
      memo: 'Supabase 10.26',
      ap_account_id: '210101',
      payment: { record: true, account_id: '2001', amount: 34.35, date: '2026-11-04', source: 'card_digits' },
    });
    expect(p.lines).toEqual([expect.objectContaining({ account_id: '622010', department_id: '7', amount: 34.35 })]);
    const checks = runChecks(extraction(), p, supabase, { existingBill: null }, ['Qiqi INC.', 'Qiqi Global Ltd.']);
    expect(canApprove(checks)).toBe(true);
    expect(checks.filter((c) => c.level !== 'ok')).toEqual([]);
  });

  it('card digits shared by two accounts → the one in the invoice currency', () => {
    const ils = extraction({ currency: 'ILS', payment: { ...extraction().payment, card_last4: '4223' } });
    expect(buildProposal(ils, supabase, cards).payment.account_id).toBe('2003');
  });

  it("no card on the invoice → the vendor's usual account, flagged", () => {
    const x = extraction({ payment: { ...extraction().payment, card_last4: null } });
    const p = buildProposal(x, supabase, cards);
    expect(p.payment).toMatchObject({ account_id: '2001', source: 'vendor_usual' });
    expect(runChecks(x, p, supabase, {}).map((c) => c.code)).toContain('payment_guess');
  });

  it('VAT-coded vendors book the net amount and let NetSuite add the VAT', () => {
    const vat = { ...supabase, codings: [{ ...supabase.codings[0], taxcode_id: '55', taxcode_name: 'ILT - VAT on Purchases IL' }] };
    const x = extraction({ currency: 'ILS', subtotal: 100, tax_total: 18, total: 118, lines: [{ description: 'x', quantity: null, unit_price: null, amount: 100, tax_rate_percent: 18 }] });
    const p = buildProposal(x, vat, cards);
    expect(p.lines[0]).toMatchObject({ amount: 100, taxcode_id: '55' });
    expect(p.expected_total).toBe(118);
  });

  it('memo month follows the service period, else the invoice date', () => {
    expect(billMemo('Vercel', { service_period: { from: null, to: null }, invoice_date: '2026-09-22' })).toBe('Vercel 09.26');
  });
});

describe('checks', () => {
  it('blocks totals that do not add up, unknown vendors, duplicates and credit notes', () => {
    const bad = extraction({ subtotal: 30 });
    expect(runChecks(bad, buildProposal(bad, supabase, cards), supabase, {}).find((c) => c.code === 'lines_vs_subtotal')?.level).toBe('block');

    const unknown = buildProposal(extraction(), null, cards);
    const codes = runChecks(extraction(), unknown, null, {}).filter((c) => c.level === 'block').map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['vendor', 'coding']));

    const dup = runChecks(extraction(), buildProposal(extraction(), supabase, cards), supabase, { existingBill: { id: '645403', tranid: 'RACPIO-00018' } });
    expect(canApprove(dup)).toBe(false);

    const credit = extraction({ document_type: 'credit_note' });
    expect(runChecks(credit, buildProposal(credit, supabase, cards), supabase, {}).some((c) => c.code === 'credit_note')).toBe(true);
  });

  it('warns on unusual amounts, other currency and invoices addressed to someone else', () => {
    const x = extraction({ total: 400, subtotal: 400, lines: [{ description: 'x', quantity: null, unit_price: null, amount: 400, tax_rate_percent: null }], currency: 'EUR', bill_to: { name: 'Gili Lisani', country: null } });
    const codes = runChecks(x, buildProposal(x, supabase, cards), supabase, {}, ['Qiqi INC.']).map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['amount_high', 'currency', 'bill_to']));
  });
});

describe('normalizeExtraction', () => {
  it('turns empty text into nulls and keeps only real dates and 4-digit cards', () => {
    const raw = {
      ...extraction(),
      vendor: { name: ' Acme ', name_latin: '', tax_id: '', email: 'Billing@Acme.io', website: '', country: '' },
      bill_to: { name: '', country: '' },
      invoice_number: '',
      invoice_date: '03/10/2026',
      due_date: '',
      currency: 'usd',
      service_period: { from: '', to: '' },
      payment: { status: 'paid' as const, method: 'unknown' as const, card_brand: '', card_last4: '•••5335', paid_date: '' },
      language: '',
    };
    const n = normalizeExtraction(raw as any);
    expect(n.vendor).toMatchObject({ name: 'Acme', name_latin: null, email: 'billing@acme.io' });
    expect(n.invoice_number).toBeNull();
    expect(n.invoice_date).toBeNull();
    expect(n.currency).toBe('USD');
    expect(n.payment).toMatchObject({ method: null, card_last4: null });
  });
});
