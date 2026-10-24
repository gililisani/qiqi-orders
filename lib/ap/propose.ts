/**
 * The proposed NetSuite bill for a read invoice, and the checks it must pass
 * (docs/AP-AUTOMATION.md §2.3–2.4). Pure: extraction + the vendor's learned
 * profile + AP settings in, proposal + checks out. NetSuite-dependent facts
 * (already booked? period open?) are passed in by the caller.
 */
import type { Coding } from './learn';
import { normalizeName } from './match';
import type { InvoiceExtraction } from './reader/schema';

export interface ProposalProfile {
  ns_vendor_id: string;
  vendor_name: string;
  subsidiary_id: string | null;
  subsidiary_name: string | null;
  currency: string | null;
  ap_account_id: string | null;
  codings: Coding[];
  payment_account_id: string | null;
  payment_account_name: string | null;
  memo_label: string | null;
  bill_count: number;
  amount_min: number | null;
  amount_max: number | null;
}

export interface PaymentAccountSetting {
  ns_account_id: string;
  name: string;
  type: 'card' | 'bank';
  last4: string | null;
  currency: string | null;
}

export interface ProposalLine {
  account_id: string | null;
  account_name: string | null;
  department_id: string | null;
  class_id: string | null;
  location_id: string | null;
  taxcode_id: string | null;
  taxcode_name: string | null;
  amount: number;
  memo: string;
}

export interface BillProposal {
  ns_vendor_id: string | null;
  vendor_name: string | null;
  subsidiary_id: string | null;
  currency: string | null;
  trandate: string | null;
  duedate: string | null;
  tranid: string | null;
  memo: string;
  ap_account_id: string | null;
  lines: ProposalLine[];
  /** Expected bill total once NetSuite adds the VAT a tax code carries. */
  expected_total: number | null;
  payment: {
    record: boolean;
    account_id: string | null;
    account_name: string | null;
    date: string | null;
    amount: number | null;
    /** Why this account: the card digits on the invoice, or the vendor's usual account. */
    source: 'card_digits' | 'vendor_usual' | null;
  };
}

export type CheckLevel = 'ok' | 'warn' | 'block';
export interface Check {
  code: string;
  level: CheckLevel;
  message: string;
}

export interface NetSuiteFacts {
  /** A bill from this vendor with this invoice number already in NetSuite. */
  existingBill?: { id: string; tranid: string } | null;
  /** The accounting period of the bill date is closed or locked for AP. */
  periodClosed?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const close = (a: number, b: number) => Math.abs(a - b) <= 0.02;

/** "Supabase 09.26": the month the charges cover (service period), else the invoice month. */
export function billMemo(label: string, extraction: Pick<InvoiceExtraction, 'service_period' | 'invoice_date'>): string {
  const d = extraction.service_period.from ?? extraction.invoice_date;
  return d ? `${label} ${d.slice(5, 7)}.${d.slice(2, 4)}` : label;
}

export function buildProposal(
  x: InvoiceExtraction,
  profile: ProposalProfile | null,
  paymentAccounts: PaymentAccountSetting[],
): BillProposal {
  const coding = profile?.codings[0];
  const total = x.total ?? null;
  const tax = x.tax_total ?? x.tax_lines.reduce((s, t) => s + t.amount, 0);
  const net = x.subtotal ?? (total !== null ? round2(total - (tax || 0)) : null);
  // A VAT-coded vendor (Israeli VAT): the line carries the net amount and the
  // tax code; NetSuite adds the VAT. Otherwise tax is part of the expense.
  const vatCoded = !!coding?.taxcode_id;
  const lineAmount = vatCoded ? net : total;
  const memo = billMemo(profile?.memo_label ?? x.vendor.name ?? 'Invoice', x);

  let payment: BillProposal['payment'] = { record: false, account_id: null, account_name: null, date: null, amount: null, source: null };
  if (x.payment.status === 'paid' && total !== null) {
    const cards = paymentAccounts.filter((a) => a.type === 'card' && a.last4 && a.last4 === x.payment.card_last4);
    const card = cards.find((a) => a.currency === x.currency) ?? cards[0];
    payment = card
      ? { record: true, account_id: card.ns_account_id, account_name: card.name, date: x.payment.paid_date ?? x.invoice_date, amount: total, source: 'card_digits' }
      : {
          record: true,
          account_id: profile?.payment_account_id ?? null,
          account_name: profile?.payment_account_name ?? null,
          date: x.payment.paid_date ?? x.invoice_date,
          amount: total,
          source: profile?.payment_account_id ? 'vendor_usual' : null,
        };
  }

  return {
    ns_vendor_id: profile?.ns_vendor_id ?? null,
    vendor_name: profile?.vendor_name ?? null,
    subsidiary_id: profile?.subsidiary_id ?? null,
    currency: x.currency,
    trandate: x.invoice_date,
    duedate: x.due_date,
    tranid: x.invoice_number,
    memo,
    ap_account_id: profile?.ap_account_id ?? null,
    lines:
      lineAmount === null
        ? []
        : [
            {
              account_id: coding?.account_id ?? null,
              account_name: coding?.account_name ?? null,
              department_id: coding?.department_id ?? null,
              class_id: coding?.class_id ?? null,
              location_id: coding?.location_id ?? null,
              taxcode_id: coding?.taxcode_id ?? null,
              taxcode_name: coding?.taxcode_name ?? null,
              amount: round2(lineAmount),
              memo,
            },
          ],
    expected_total: total,
    payment,
  };
}

export function runChecks(
  x: InvoiceExtraction,
  proposal: BillProposal,
  profile: ProposalProfile | null,
  facts: NetSuiteFacts,
  orgNames: string[] = [],
): Check[] {
  const checks: Check[] = [];
  const add = (code: string, level: CheckLevel, message: string) => checks.push({ code, level, message });

  if (x.document_type === 'credit_note') add('credit_note', 'block', 'This is a credit note — enter it in NetSuite as a vendor credit (not automated yet).');

  // Numbers add up.
  const lineSum = round2(x.lines.reduce((s, l) => s + l.amount, 0));
  const tax = x.tax_total ?? round2(x.tax_lines.reduce((s, t) => s + t.amount, 0));
  if (x.total === null) add('total_missing', 'block', 'No total found on the invoice.');
  else if (x.subtotal !== null && x.lines.length && !close(lineSum, x.subtotal)) {
    add('lines_vs_subtotal', 'block', `Lines add up to ${lineSum}, but the subtotal says ${x.subtotal}.`);
  } else if (x.subtotal !== null && !close(round2(x.subtotal + (tax || 0)), x.total)) {
    add('subtotal_plus_tax', 'block', `Subtotal ${x.subtotal} + tax ${tax || 0} doesn't equal the total ${x.total}.`);
  } else add('math', 'ok', 'The numbers add up.');

  // Vendor.
  if (!proposal.ns_vendor_id) add('vendor', 'block', 'Vendor not recognized — choose the NetSuite vendor.');
  if (!proposal.lines[0]?.account_id) add('coding', 'block', 'No expense account — choose how to book it.');
  if (profile?.codings[0]?.item_based) add('item_lines', 'warn', "This vendor's past bills used item lines; this bill uses an expense line.");
  if (profile && (profile.codings[0]?.share ?? 1) < 1) add('coding_varies', 'warn', 'This vendor has been booked more than one way — check the account.');

  // Already booked?
  if (facts.existingBill) add('duplicate', 'block', `Already in NetSuite as bill ${facts.existingBill.tranid || facts.existingBill.id}.`);
  else if (!x.invoice_number) add('no_invoice_number', 'warn', 'No invoice number — duplicates cannot be detected by number.');

  // Normal for this vendor?
  if (profile?.currency && x.currency && profile.currency !== x.currency) {
    add('currency', 'warn', `Billed in ${x.currency}; this vendor is usually billed in ${profile.currency}.`);
  }
  if (profile && profile.bill_count >= 3 && x.total !== null && profile.amount_max !== null && profile.amount_min !== null) {
    if (x.total > profile.amount_max * 3) add('amount_high', 'warn', `Much higher than usual (usually up to ${profile.amount_max}).`);
    else if (x.total < profile.amount_min / 3) add('amount_low', 'warn', `Much lower than usual (usually at least ${profile.amount_min}).`);
  }

  // Dates and period.
  if (!x.invoice_date) add('date', 'block', 'No invoice date found.');
  if (facts.periodClosed) add('period_closed', 'block', 'The accounting period of the invoice date is closed — the bill date must move to an open period.');

  // Payment.
  if (x.payment.status === 'paid' && !proposal.payment.account_id) add('payment_account', 'block', 'Paid, but the paying card or bank account is unknown — choose it.');
  if (x.payment.status === 'paid' && proposal.payment.source === 'vendor_usual') {
    add('payment_guess', 'warn', `The invoice doesn't show the card — using this vendor's usual account (${proposal.payment.account_name}).`);
  }
  if (x.payment.status === 'unknown') add('payment_unknown', 'warn', "The invoice doesn't say whether it was paid — no payment will be recorded.");

  // Addressed to us?
  if (orgNames.length && x.bill_to.name) {
    const to = normalizeName(x.bill_to.name);
    const ours = orgNames.map(normalizeName).filter(Boolean);
    if (to && !ours.some((n) => to.includes(n) || n.includes(to))) {
      add('bill_to', 'warn', `Addressed to “${x.bill_to.name}”.`);
    }
  }

  for (const w of x.warnings) if (w) add('reader', 'warn', w);
  return checks;
}

export const canApprove = (checks: Check[]) => !checks.some((c) => c.level === 'block');
