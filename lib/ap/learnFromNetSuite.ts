/**
 * Runs the AP learning against NetSuite (read-only there) and saves what it
 * learned: vendor profiles + the accounts that pay bills. Re-runnable; edits
 * a person made are kept (a 'manual' profile keeps its coding and payment
 * account, only its statistics refresh; a card's last 4 typed in settings
 * is kept when the account name doesn't carry one).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NetSuiteAPI } from '../netsuite';
import {
  buildPaymentAccounts,
  buildVendorProfiles,
  type AccountRow,
  type BillLineRow,
  type PaymentAccount,
  type PaymentRow,
  type VendorRow,
} from './learn';

/** How far back the history goes. */
export const LEARN_MONTHS = 18;

export interface LearnSummary {
  since: string;
  bills: number;
  vendors: number;
  /** Vendors with 2+ bills that were always booked the same way. */
  consistentVendors: number;
  paymentAccounts: number;
  cards: number;
}

export async function learnFromNetSuite(
  db: SupabaseClient,
  ns: Pick<NetSuiteAPI, 'suiteQLPaged'>,
  opts: { now?: Date; actor?: string | null } = {},
): Promise<LearnSummary> {
  const now = opts.now ?? new Date();
  const sinceDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - LEARN_MONTHS, 1));
  const since = sinceDate.toISOString().slice(0, 10);
  const sinceSql = `TO_DATE('${since}', 'YYYY-MM-DD')`;

  const lines = await ns.suiteQLPaged<BillLineRow>(`
    SELECT t.id, t.entity, t.trandate, BUILTIN.DF(t.currency) AS currency_name, t.foreigntotal, t.memo,
           tl.mainline, tl.taxline, tl.expenseaccount, BUILTIN.DF(tl.expenseaccount) AS account_name,
           tl.subsidiary, BUILTIN.DF(tl.subsidiary) AS subsidiary_name,
           tl.department, BUILTIN.DF(tl.department) AS department_name,
           tl.class, BUILTIN.DF(tl.class) AS class_name,
           tl.location, BUILTIN.DF(tl.location) AS location_name,
           tl.taxcode, BUILTIN.DF(tl.taxcode) AS taxcode_name, tl.item
      FROM transaction t JOIN transactionline tl ON tl.transaction = t.id
     WHERE t.type = 'VendBill' AND t.trandate >= ${sinceSql} AND t.externalid IS NULL`);

  const payments = await ns.suiteQLPaged<PaymentRow>(`
    SELECT p.entity, p.trandate, tl.expenseaccount AS account, BUILTIN.DF(tl.expenseaccount) AS account_name
      FROM transaction p JOIN transactionline tl ON tl.transaction = p.id
     WHERE p.type = 'VendPymt' AND p.trandate >= ${sinceSql} AND tl.mainline = 'T'`);

  const vendorIds = [...new Set(lines.map((l) => String(l.entity)))].filter((id) => /^\d+$/.test(id));
  const vendors: VendorRow[] = [];
  for (let i = 0; i < vendorIds.length; i += 500) {
    vendors.push(
      ...(await ns.suiteQLPaged<VendorRow>(
        `SELECT id, entityid, companyname, email FROM vendor WHERE id IN (${vendorIds.slice(i, i + 500).join(',')})`,
      )),
    );
  }

  const accounts = await ns.suiteQLPaged<AccountRow>(`
    SELECT id, acctnumber, accountsearchdisplaynamecopy AS name, accttype, BUILTIN.DF(currency) AS currency_name
      FROM account WHERE accttype IN ('Bank', 'CredCard') AND isinactive = 'F'`);

  const profiles = buildVendorProfiles(lines, payments, vendors);
  const learnedAccounts = buildPaymentAccounts(accounts, payments);
  const learnedAt = now.toISOString();

  // --- vendor profiles ---
  const { data: existing, error: readErr } = await db
    .from('ap_vendor_profiles')
    .select('ns_vendor_id, source, sender_emails, aliases');
  if (readErr) throw new Error(`ap_vendor_profiles read failed: ${readErr.message}`);
  const byId = new Map((existing ?? []).map((r: any) => [r.ns_vendor_id as string, r]));

  const rows = profiles.map((p) => {
    const prev = byId.get(p.ns_vendor_id);
    const merged = {
      sender_emails: [...new Set([...(prev?.sender_emails ?? []), ...p.sender_emails])],
      aliases: [...new Set([...(prev?.aliases ?? []), ...p.aliases])],
    };
    const stats = {
      ns_vendor_id: p.ns_vendor_id,
      vendor_name: p.vendor_name,
      bill_count: p.bill_count,
      amount_median: p.amount_median,
      amount_min: p.amount_min,
      amount_max: p.amount_max,
      last_bill_date: p.last_bill_date,
      learned_at: learnedAt,
      updated_at: learnedAt,
      ...merged,
    };
    if (prev?.source === 'manual') return stats;
    return { ...p, ...stats, source: 'history' };
  });
  const manualIds = new Set(rows.filter((r) => !('codings' in r)).map((r) => r.ns_vendor_id));
  const full = rows.filter((r) => !manualIds.has(r.ns_vendor_id));
  const statsOnly = rows.filter((r) => manualIds.has(r.ns_vendor_id));
  for (let i = 0; i < full.length; i += 200) {
    const { error } = await db.from('ap_vendor_profiles').upsert(full.slice(i, i + 200), { onConflict: 'ns_vendor_id' });
    if (error) throw new Error(`ap_vendor_profiles save failed: ${error.message}`);
  }
  for (const r of statsOnly) {
    const { error } = await db.from('ap_vendor_profiles').update(r).eq('ns_vendor_id', r.ns_vendor_id);
    if (error) throw new Error(`ap_vendor_profiles save failed: ${error.message}`);
  }

  // --- payment accounts (keep a last 4 typed in settings) ---
  const { data: settings } = await db.from('ap_settings').select('payment_accounts').eq('id', 1).maybeSingle();
  const prevAccounts = new Map(
    ((settings?.payment_accounts ?? []) as PaymentAccount[]).map((a) => [a.ns_account_id, a]),
  );
  const paymentAccounts = learnedAccounts.map((a) => ({
    ...a,
    last4: a.last4 ?? prevAccounts.get(a.ns_account_id)?.last4 ?? null,
  }));

  const summary: LearnSummary = {
    since,
    bills: new Set(lines.filter((l) => l.mainline === 'T').map((l) => l.id)).size,
    vendors: profiles.length,
    consistentVendors: profiles.filter((p) => p.bill_count >= 2 && p.consistency === 1).length,
    paymentAccounts: paymentAccounts.length,
    cards: paymentAccounts.filter((a) => a.type === 'card').length,
  };
  const { error: setErr } = await db
    .from('ap_settings')
    .update({ payment_accounts: paymentAccounts, learned_at: learnedAt, learn_summary: summary, updated_at: learnedAt, updated_by: opts.actor ?? null })
    .eq('id', 1);
  if (setErr) throw new Error(`ap_settings save failed: ${setErr.message}`);
  return summary;
}
