/**
 * AP learning (docs/AP-AUTOMATION.md §2.3): how each vendor has been booked,
 * learned from its past bills in NetSuite — no mapping screens. Pure: takes
 * SuiteQL rows, returns vendor profiles + the accounts that pay bills.
 *
 * Only bills a person typed are learned from: bills with an external id were
 * created by an integration (the Hub's own Shopify fee and Amazon bills).
 */
import { normalizeNsDate } from '../netsuite';

/** One transactionline row of a vendor bill (header line + expense/tax lines). */
export interface BillLineRow {
  id: string;
  entity: string;
  trandate: string;
  currency_name: string | null;
  foreigntotal: string | number | null;
  memo: string | null;
  mainline: 'T' | 'F';
  taxline: 'T' | 'F';
  expenseaccount: string | null;
  account_name: string | null;
  subsidiary: string | null;
  subsidiary_name: string | null;
  department: string | null;
  department_name: string | null;
  class: string | null;
  class_name: string | null;
  location: string | null;
  location_name: string | null;
  taxcode: string | null;
  taxcode_name: string | null;
  item: string | null;
}

/** The paying-account line of a vendor bill payment. */
export interface PaymentRow {
  entity: string;
  trandate?: string | null;
  account: string | null;
  account_name: string | null;
}

export interface VendorRow {
  id: string;
  entityid: string | null;
  companyname: string | null;
  email: string | null;
}

export interface AccountRow {
  id: string;
  acctnumber: string | null;
  name: string | null;
  accttype: string;
  currency_name: string | null;
}

export interface Coding {
  account_id: string | null;
  account_name: string | null;
  department_id: string | null;
  department_name: string | null;
  class_id: string | null;
  class_name: string | null;
  location_id: string | null;
  location_name: string | null;
  taxcode_id: string | null;
  taxcode_name: string | null;
  /** Bill lines are items, not expenses — Phase 1 posts expense lines only. */
  item_based: boolean;
  /** Share of the vendor's recent bill lines that used this coding (0..1). */
  share: number;
  /** Date of the latest bill that used it. */
  last_used: string | null;
}

export interface VendorProfile {
  ns_vendor_id: string;
  vendor_name: string;
  subsidiary_id: string | null;
  subsidiary_name: string | null;
  currency: string | null;
  ap_account_id: string | null;
  ap_account_name: string | null;
  codings: Coding[];
  payment_account_id: string | null;
  payment_account_name: string | null;
  memo_label: string | null;
  /** How its memos write the period: "09.26" (month) or "23.09-23.10.26" (range). */
  memo_style: 'month' | 'range';
  bill_count: number;
  consistency: number | null;
  amount_median: number | null;
  amount_min: number | null;
  amount_max: number | null;
  last_bill_date: string | null;
  sender_emails: string[];
  aliases: string[];
}

export interface PaymentAccount {
  ns_account_id: string;
  name: string;
  type: 'card' | 'bank';
  /** Last 4 digits of the card, read from the account name ("… Visa 5335"). */
  last4: string | null;
  currency: string | null;
  /** Vendor bill payments made from it in the learning window. */
  uses: number;
}

const mostCommon = <T>(values: T[]): T | null => {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
};

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The vendor part of a "<Vendor> <period>" memo: "Supabase 09.26" →
 * "Supabase"; "Anthropic 23.09-23.10.26" → "Anthropic"; "Klaviyo - Oct 2026"
 * → "Klaviyo". The period is whatever trails in digits, separators and
 * month names.
 */
export function memoLabel(memo: string | null | undefined): string | null {
  const s = (memo ?? '')
    .replace(/(?:\s*[-–—]\s*|\s+)(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?|[\d.\/\-–\s])+$/i, '')
    .trim();
  return /\p{L}/u.test(s) ? s : null;
}

const RANGE_MEMO = /\d{1,2}\.\d{1,2}\s*[-–]\s*\d{1,2}\.\d{1,2}\.\d{2,4}\s*$/;

/** 'range' when most of the vendor's recent memos carry a DD.MM-DD.MM.YY period. */
export function memoStyle(memos: Array<string | null | undefined>): 'month' | 'range' {
  const recent = memos.filter((m): m is string => !!m).slice(0, RECENT_BILLS);
  const ranged = recent.filter((m) => RANGE_MEMO.test(m)).length;
  return recent.length && ranged * 2 > recent.length ? 'range' : 'month';
}

/** Card last 4 from an account name: "IDB Qiqi INC Visa 5335" → "5335". */
export function cardLast4(name: string | null | undefined): string | null {
  const groups = (name ?? '').match(/(?<!\d)\d{4}(?!\d)/g);
  return groups ? groups[groups.length - 1] : null;
}

/**
 * The profile follows how the vendor is booked NOW: codings and the payment
 * account are ranked over its most recent bills (a vendor moved to another
 * account last spring is proposed with the new one).
 */
export const RECENT_BILLS = 6;

const codingKey = (l: BillLineRow) =>
  [l.expenseaccount, l.department, l.class, l.location, l.taxcode, l.item ? 'item' : ''].join('|');

export function buildVendorProfiles(lines: BillLineRow[], payments: PaymentRow[], vendors: VendorRow[]): VendorProfile[] {
  const vendorById = new Map(vendors.map((v) => [String(v.id), v]));
  const bills = new Map<string, { entity: string; header?: BillLineRow; expense: BillLineRow[] }>();
  for (const l of lines) {
    const b = bills.get(l.id) ?? { entity: String(l.entity), expense: [] };
    if (l.mainline === 'T') b.header = l;
    else if (l.taxline !== 'T') b.expense.push(l);
    bills.set(l.id, b);
  }

  const payByVendor = new Map<string, PaymentRow[]>();
  for (const p of payments) {
    const list = payByVendor.get(String(p.entity)) ?? [];
    list.push(p);
    payByVendor.set(String(p.entity), list);
  }

  const byVendor = new Map<string, Array<{ header?: BillLineRow; expense: BillLineRow[] }>>();
  for (const b of bills.values()) {
    if (!b.header) continue;
    const list = byVendor.get(b.entity) ?? [];
    list.push(b);
    byVendor.set(b.entity, list);
  }

  const iso = (d: string | null | undefined) => normalizeNsDate(d) ?? '';
  const profiles: VendorProfile[] = [];
  for (const [vendorId, vBills] of byVendor) {
    vBills.sort((a, b) => iso(b.header!.trandate).localeCompare(iso(a.header!.trandate)));
    const headers = vBills.map((b) => b.header!);
    const expense = vBills.flatMap((b) => b.expense);
    const recent = vBills.slice(0, RECENT_BILLS).flatMap((b) => b.expense);
    const dateOf = new Map(vBills.map((b) => [b.header!.id, iso(b.header!.trandate)]));

    const groups = new Map<string, BillLineRow[]>();
    for (const l of expense) {
      const k = codingKey(l);
      groups.set(k, [...(groups.get(k) ?? []), l]);
    }
    const recentCount = new Map<string, number>();
    for (const l of recent) recentCount.set(codingKey(l), (recentCount.get(codingKey(l)) ?? 0) + 1);
    const codings: Coding[] = [...groups.values()]
      .map((g) => ({
        account_id: g[0].expenseaccount,
        account_name: g[0].account_name,
        department_id: g[0].department,
        department_name: g[0].department_name,
        class_id: g[0].class,
        class_name: g[0].class_name,
        location_id: g[0].location,
        location_name: g[0].location_name,
        taxcode_id: g[0].taxcode,
        taxcode_name: g[0].taxcode_name,
        item_based: !!g[0].item,
        share: recent.length ? (recentCount.get(codingKey(g[0])) ?? 0) / recent.length : 0,
        last_used: g.map((l) => dateOf.get(l.id) ?? '').sort().pop() || null,
      }))
      .sort((a, b) => b.share - a.share || (b.last_used ?? '').localeCompare(a.last_used ?? ''));

    const pays = [...(payByVendor.get(vendorId) ?? [])].sort((a, b) => iso(b.trandate).localeCompare(iso(a.trandate)));
    // Payments switch faster than coding (a vendor moved to a card): the
    // last 3 payments decide.
    const payAccount = mostCommon(pays.slice(0, 3).map((p) => p.account).filter((a): a is string => !!a));
    const amounts = headers.map((h) => Math.abs(Number(h.foreigntotal ?? 0))).filter((n) => Number.isFinite(n));
    const dates = headers.map((h) => normalizeNsDate(h.trandate)).filter((d): d is string => !!d).sort();
    const vendor = vendorById.get(vendorId);
    const name = vendor?.companyname?.trim() || vendor?.entityid?.trim() || vendorId;
    const subsidiary = mostCommon(headers.slice(0, RECENT_BILLS).map((h) => h.subsidiary));
    // Memo label only when the vendor's memos follow one pattern ("Supabase
    // 09.26" on most bills); free-text memos fall back to the vendor name.
    const labels = headers.map((h) => memoLabel(h.memo)).filter((m): m is string => !!m);
    const label = mostCommon(labels);
    const labelCoverage = label ? labels.filter((m) => m === label).length / headers.length : 0;
    const apAccount = mostCommon(headers.slice(0, RECENT_BILLS).map((h) => h.expenseaccount));

    profiles.push({
      ns_vendor_id: vendorId,
      vendor_name: name,
      subsidiary_id: subsidiary,
      subsidiary_name: headers.find((h) => h.subsidiary === subsidiary)?.subsidiary_name ?? null,
      currency: mostCommon(headers.slice(0, RECENT_BILLS).map((h) => h.currency_name)),
      ap_account_id: apAccount,
      ap_account_name: headers.find((h) => h.expenseaccount === apAccount)?.account_name ?? null,
      codings,
      payment_account_id: payAccount,
      payment_account_name: pays.find((p) => p.account === payAccount)?.account_name ?? null,
      memo_label: label && labelCoverage >= 0.5 ? label : name,
      memo_style: memoStyle(headers.map((h) => h.memo)),
      bill_count: headers.length,
      consistency: codings.length ? codings[0].share : null,
      amount_median: median(amounts),
      amount_min: amounts.length ? Math.min(...amounts) : null,
      amount_max: amounts.length ? Math.max(...amounts) : null,
      last_bill_date: dates.length ? dates[dates.length - 1] : null,
      sender_emails: vendor?.email ? [vendor.email.trim().toLowerCase()] : [],
      aliases: [...new Set([vendor?.companyname?.trim(), vendor?.entityid?.trim()].filter((a): a is string => !!a))],
    });
  }
  return profiles.sort((a, b) => b.bill_count - a.bill_count);
}

/**
 * The accounts that pay vendor bills: every card account, plus any bank
 * account that paid a vendor bill in the window. Cards carry their last 4.
 */
export function buildPaymentAccounts(accounts: AccountRow[], payments: PaymentRow[]): PaymentAccount[] {
  const uses = new Map<string, number>();
  for (const p of payments) if (p.account) uses.set(String(p.account), (uses.get(String(p.account)) ?? 0) + 1);
  return accounts
    .filter((a) => a.accttype === 'CredCard' || uses.has(String(a.id)))
    .map((a): PaymentAccount => {
      const type = a.accttype === 'CredCard' ? 'card' : 'bank';
      return {
        ns_account_id: String(a.id),
        name: [a.acctnumber, a.name].filter(Boolean).join(' '),
        type,
        last4: type === 'card' ? cardLast4(a.name) : null,
        currency: a.currency_name,
        uses: uses.get(String(a.id)) ?? 0,
      };
    })
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
}
