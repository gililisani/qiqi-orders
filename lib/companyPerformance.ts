/**
 * Company performance — the math behind every "how much did a company sell"
 * view: the Company Performance report, the per-company drill-down (admin and
 * client), the client dashboard and target-period progress.
 *
 * What counts is defined ONCE, in the database view `sales_entries` (owner
 * 2026-10-08, Hub first): Hub orders once Done or paid in full, plus the
 * NetSuite documents an admin approved on the NetSuite review page —
 * invoices billed externally and credits. This module only sums those
 * entries by date, so every view agrees.
 *
 * Support funds: a Hub order carries what it earned (credit_earned) and what
 * the client claimed (its SF items — orders.support_fund_used is capped at
 * earned, so the items are the truth). An invoice billed externally carries
 * its discount as both earned and used. Credits never carry support funds.
 * Balance = earned − used: positive → leftover, negative → top-up.
 *
 * `fetchRevenueInputs` loads everything in a FIXED number of queries and
 * THROWS on any query error — no silent partial zeros (2026-07 incident).
 * The math is pure and unit-tested.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type PeriodStatus =
  | 'Not Started'
  | 'Ahead'
  | 'On Track'
  | 'Slipping'
  | 'Complete'
  | 'Fail';

export interface CompanyPeriodRow {
  periodId: string;
  periodName: string;
  startDate: string;
  endDate: string;
  target: number;
  actual: number;
  progressPct: number;
  expectedPct: number;
  status: PeriodStatus;
  sfEarned: number;
  sfUsed: number;
  sfBalance: number;
}

export interface TopProductRow {
  productId: number | null;
  sku: string | null;
  name: string | null;
  units: number;
  revenue: number;
}

export interface CompanyPerformance {
  company: {
    id: string;
    name: string;
    netsuiteNumber: string | null;
    subsidiaryName: string | null;
    isEnrolled: boolean;
    /** Support-fund tier percent (null when not enrolled) — drives the
     *  client dashboard's "reaching your goal earns ≈$X" projection. */
    sfPercent: number | null;
    agreementStart: string | null; // first period start
    agreementEnd: string | null; // last period end
  };
  toDate: {
    sales: number; // every counted entry, all time
    orders: number; // Hub orders + invoices billed externally
    sfEarned: number;
    sfUsed: number;
    sfBalance: number;
  };
  periods: CompanyPeriodRow[];
  window: {
    from: string;
    to: string;
    sales: number;
    orders: number;
    units: number;
    topProducts: TopProductRow[]; // top 10 by revenue
    productCount: number; // distinct products bought in window
    sfEarned: number;
    sfUsed: number;
  };
}

/** Single source of truth for period status — used by the Company
 *  Performance report route AND the drill-down builder. Change thresholds
 *  here only. */
export function classifyStatus(
  now: Date,
  startDate: Date,
  endDate: Date,
  target: number,
  actual: number,
  progressPct: number,
  expectedPct: number
): PeriodStatus {
  if (now < startDate) return 'Not Started';
  // Ended periods have a verdict, not a forecast: target met → Complete,
  // target missed → Fail (never Slipping/At Risk — those are for live periods).
  if (now > endDate) return actual >= target ? 'Complete' : 'Fail';
  if (progressPct >= expectedPct + 5) return 'Ahead';
  if (progressPct < expectedPct - 20) return 'Slipping';
  return 'On Track';
}

export interface PeriodMetrics {
  target: number;
  actual: number;
  sfEarned: number;
  sfUsed: number;
  sfBalance: number;
  daysTotal: number;
  daysElapsed: number;
  daysRemaining: number;
  progressPct: number;
  expectedPct: number;
  paceDeltaPct: number;
  status: PeriodStatus;
}

/** One row of the `sales_entries` view. */
export interface SalesEntry {
  company_id: string;
  day: string; // YYYY-MM-DD — the day it counts
  source: string; // hub_order | billed_externally | credit
  order_id: string | null;
  document_id: string | null;
  amount: number | string | null;
  sf_earned: number | string | null;
  sf_used: number | string | null;
}

const num = (v: unknown) => Number(v) || 0;
/** Entries that are orders to the client: Hub orders and invoices billed externally. */
const isPurchase = (e: Pick<SalesEntry, 'source'>) => e.source === 'hub_order' || e.source === 'billed_externally';

/**
 * Pure per-period math over one company's entries. An entry counts when its
 * day falls inside the period (inclusive calendar days).
 */
export function computePeriodMetrics(
  now: Date,
  period: { start_date: string; end_date: string; target_amount: number | string | null },
  entries: SalesEntry[]
): PeriodMetrics {
  const startDate = new Date(`${period.start_date}T00:00:00.000Z`);
  const endDate = new Date(`${period.end_date}T23:59:59.999Z`);
  const target = Number(period.target_amount) || 0;

  let actual = 0;
  let sfEarned = 0;
  let sfUsed = 0;
  for (const e of entries) {
    if (e.day < period.start_date || e.day > period.end_date) continue;
    actual += num(e.amount);
    sfEarned += num(e.sf_earned);
    sfUsed += num(e.sf_used);
  }

  const daysTotal = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000));
  const daysElapsed = Math.max(
    0,
    Math.min(daysTotal, Math.ceil((Math.min(now.getTime(), endDate.getTime()) - startDate.getTime()) / 86400000))
  );
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);
  const progressPct = target > 0 ? (actual / target) * 100 : 0;
  const expectedPct = (daysElapsed / daysTotal) * 100;
  const paceDeltaPct = progressPct - expectedPct;

  return {
    target,
    actual,
    sfEarned,
    sfUsed,
    sfBalance: sfEarned - sfUsed,
    daysTotal,
    daysElapsed,
    daysRemaining,
    progressPct,
    expectedPct,
    paceDeltaPct,
    status: classifyStatus(now, startDate, endDate, target, actual, progressPct, expectedPct),
  };
}

/** Resolve a drill-down window key (this-month / last-month / this-year /
 *  last-year / custom) to a concrete UTC range. Shared by the admin
 *  drill-down route and the client performance route. */
export function resolveWindowRange(
  window: string,
  fromParam: string | null,
  toParam: string | null
): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  if (window === 'last-month') {
    return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)) };
  }
  if (window === 'this-year') {
    return { from: new Date(Date.UTC(y, 0, 1)), to: now };
  }
  if (window === 'last-year') {
    return { from: new Date(Date.UTC(y - 1, 0, 1)), to: new Date(Date.UTC(y - 1, 11, 31, 23, 59, 59, 999)) };
  }
  if (window === 'custom') {
    if (!fromParam || !toParam || !/^\d{4}-\d{2}-\d{2}$/.test(fromParam) || !/^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
      throw new Error('custom window requires valid from and to dates');
    }
    return { from: new Date(`${fromParam}T00:00:00.000Z`), to: new Date(`${toParam}T23:59:59.999Z`) };
  }
  // default: this-month
  return { from: new Date(Date.UTC(y, m, 1)), to: now };
}

/** First-Done timestamp per order — "first Done wins". Rows must be sorted
 *  created_at ascending. (Order-based Support Funds report.) */
export function buildFirstDoneMap(
  historyRows: Array<{ order_id: string; created_at: string }>
): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const h of historyRows) {
    if (!map.has(h.order_id)) map.set(h.order_id, new Date(h.created_at));
  }
  return map;
}

/** Sum SF line items per order — "what the client claimed" on a Hub order.
 *  (Order-based Support Funds report.) */
export function buildSfUsedByOrder(
  sfItems: Array<{ order_id: string; total_price: number | string | null }>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of sfItems) {
    map.set(item.order_id, (map.get(item.order_id) ?? 0) + (Number(item.total_price) || 0));
  }
  return map;
}

export interface SfBehaviorDistribution {
  underRedeemedPct: number;
  fullyRedeemedPct: number;
  toppedUpPct: number;
  avgTopUp: number;
  avgLeftover: number;
  sampleSize: number;
}

/**
 * Per-ORDER redemption behavior across enrolled companies: one sample per
 * Hub order whose day falls inside one of its company's enrolled periods.
 * Invoices billed externally are left out — their discount is all we know,
 * so whether the client topped up or left funds unused is unknowable.
 * Orders with zero earned AND zero claimed carry no signal and are skipped.
 */
export function computeSfBehaviorDistribution(
  enrolledPeriods: Array<{ company_id: string; start_date: string; end_date: string }>,
  entries: SalesEntry[]
): SfBehaviorDistribution {
  const periodsByCompany = new Map<string, Array<{ s: string; e: string }>>();
  for (const p of enrolledPeriods) {
    const list = periodsByCompany.get(p.company_id) ?? [];
    list.push({ s: p.start_date, e: p.end_date });
    periodsByCompany.set(p.company_id, list);
  }

  let under = 0,
    full = 0,
    over = 0;
  let topUpSum = 0,
    leftoverSum = 0;
  let total = 0;

  for (const entry of entries) {
    if (entry.source !== 'hub_order') continue;
    const ranges = periodsByCompany.get(entry.company_id) ?? [];
    if (!ranges.some((r) => entry.day >= r.s && entry.day <= r.e)) continue;
    const earned = num(entry.sf_earned);
    const claimed = num(entry.sf_used);
    if (earned === 0 && claimed === 0) continue;
    total += 1;
    const delta = earned - claimed;
    if (Math.abs(delta) < 0.01) {
      full += 1;
    } else if (delta > 0) {
      under += 1;
      leftoverSum += delta;
    } else {
      over += 1;
      topUpSum += -delta;
    }
  }

  return {
    underRedeemedPct: total > 0 ? (under / total) * 100 : 0,
    fullyRedeemedPct: total > 0 ? (full / total) * 100 : 0,
    toppedUpPct: total > 0 ? (over / total) * 100 : 0,
    avgTopUp: over > 0 ? topUpSum / over : 0,
    avgLeftover: under > 0 ? leftoverSum / under : 0,
    sampleSize: total,
  };
}

/** One product line of a counted entry, dated by the entry's day. Hub orders
 *  give their order items; NetSuite documents give their product lines
 *  (credits negative). */
export interface EntryProductLine {
  day: string;
  product_id: number | null;
  sku: string | null;
  name: string | null;
  quantity: number | string | null;
  amount: number | string | null;
}

interface RawInputs {
  now: Date;
  company: any; // id, company_name, netsuite_number, support_fund_id, support_fund(percent), subsidiary(name)
  periods: any[];
  entries: SalesEntry[]; // this company's entries
  productLines: EntryProductLine[]; // this company's product lines
  windowFrom: Date;
  windowTo: Date;
}

export function computeCompanyMetrics(inputs: RawInputs): CompanyPerformance {
  const { now, company, periods, entries, productLines, windowFrom, windowTo } = inputs;
  const sfPercent =
    (Array.isArray(company.support_fund) ? company.support_fund[0] : company.support_fund)?.percent ?? null;

  // ---- To date: every counted entry ---------------------------------------
  let toDateSales = 0;
  let toDateOrders = 0;
  let toDateSfEarned = 0;
  let toDateSfUsed = 0;
  for (const e of entries) {
    toDateSales += num(e.amount);
    if (isPurchase(e)) toDateOrders += 1;
    toDateSfEarned += num(e.sf_earned);
    toDateSfUsed += num(e.sf_used);
  }

  // ---- Per-period rows -----------------------------------------------------
  const periodRows: CompanyPeriodRow[] = periods.map((p) => {
    const m = computePeriodMetrics(now, p, entries);
    return {
      periodId: p.id,
      periodName: p.period_name ?? '',
      startDate: p.start_date,
      endDate: p.end_date,
      target: m.target,
      actual: m.actual,
      progressPct: m.progressPct,
      expectedPct: m.expectedPct,
      status: m.status,
      sfEarned: m.sfEarned,
      sfUsed: m.sfUsed,
      sfBalance: m.sfBalance,
    };
  });

  // ---- Window ----------------------------------------------------------------
  const windowFromDay = windowFrom.toISOString().slice(0, 10);
  const windowToDay = windowTo.toISOString().slice(0, 10);
  const inWindow = (d: string) => d >= windowFromDay && d <= windowToDay;
  let windowSales = 0;
  let windowOrders = 0;
  let windowSfEarned = 0;
  let windowSfUsed = 0;
  for (const e of entries) {
    if (!inWindow(e.day)) continue;
    windowSales += num(e.amount);
    if (isPurchase(e)) windowOrders += 1;
    windowSfEarned += num(e.sf_earned);
    windowSfUsed += num(e.sf_used);
  }

  const productAgg = new Map<string, TopProductRow>();
  let windowUnits = 0;
  for (const line of productLines) {
    if (!inWindow(line.day)) continue;
    const units = num(line.quantity);
    const revenue = num(line.amount);
    windowUnits += units;
    const key = String(line.product_id ?? line.sku ?? line.name ?? 'unknown');
    const entry = productAgg.get(key) ?? {
      productId: line.product_id ?? null,
      sku: line.sku ?? null,
      name: line.name ?? null,
      units: 0,
      revenue: 0,
    };
    entry.units += units;
    entry.revenue += revenue;
    productAgg.set(key, entry);
  }
  const allProducts = Array.from(productAgg.values())
    .filter((p) => Math.abs(p.units) > 0.001 || Math.abs(p.revenue) > 0.001)
    .sort((a, b) => b.revenue - a.revenue);

  const firstPeriod = periods.length
    ? periods.reduce((min, p) => (p.start_date < min ? p.start_date : min), periods[0].start_date)
    : null;
  const lastPeriod = periods.length
    ? periods.reduce((max, p) => (p.end_date > max ? p.end_date : max), periods[0].end_date)
    : null;

  return {
    company: {
      id: company.id,
      name: company.company_name ?? 'Unknown',
      netsuiteNumber: company.netsuite_number ?? null,
      subsidiaryName: company.subsidiary?.name ?? null,
      isEnrolled: company.support_fund_id != null,
      sfPercent,
      agreementStart: firstPeriod,
      agreementEnd: lastPeriod,
    },
    toDate: {
      sales: toDateSales,
      orders: toDateOrders,
      sfEarned: toDateSfEarned,
      sfUsed: toDateSfUsed,
      sfBalance: toDateSfEarned - toDateSfUsed,
    },
    // Newest first: the active year on top, ended years below.
    periods: periodRows.sort((a, b) => (a.startDate > b.startDate ? -1 : 1)),
    window: {
      from: windowFrom.toISOString(),
      to: windowTo.toISOString(),
      sales: windowSales,
      orders: windowOrders,
      units: windowUnits,
      topProducts: allProducts.slice(0, 10),
      productCount: allProducts.length,
      sfEarned: windowSfEarned,
      sfUsed: windowSfUsed,
    },
  };
}

/** Every row of a query, past PostgREST's 1,000-row page. */
async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Run an `.in()` query in chunks (long id lists overflow the URL). */
async function inChunks<T>(ids: string[], run: (part: string[]) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await run(ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

export interface RevenueInputs {
  entries: SalesEntry[];
}

/**
 * Batched fetch of the counted entries for a set of companies — one paged
 * query regardless of company/period count. Throws on any query error:
 * callers must never render partial zeros as real numbers.
 */
export async function fetchRevenueInputs(supabase: SupabaseClient, companyIds: string[]): Promise<RevenueInputs> {
  if (companyIds.length === 0) return { entries: [] };
  const entries = await selectAll<SalesEntry>((a, b) =>
    supabase
      .from('sales_entries')
      .select('company_id, day, source, order_id, document_id, amount, sf_earned, sf_used')
      .in('company_id', companyIds)
      .order('day')
      .order('source')
      .order('order_id')
      .order('document_id')
      .range(a, b)
  );
  return { entries };
}

/** Product lines behind a company's counted entries (Hub order items + the
 *  approved NetSuite documents' product lines), dated by the entry's day. */
async function fetchEntryProductLines(supabase: SupabaseClient, entries: SalesEntry[]): Promise<EntryProductLine[]> {
  const orderDay = new Map<string, string>();
  const docDay = new Map<string, string>();
  for (const e of entries) {
    if (e.source === 'hub_order' && e.order_id) orderDay.set(e.order_id, e.day);
    else if (e.document_id) docDay.set(e.document_id, e.day);
  }
  const [items, lines] = await Promise.all([
    inChunks<any>(Array.from(orderDay.keys()), (part) =>
      supabase.from('order_items').select('order_id, product_id, quantity, total_price, product:Products(sku, item_name)').in('order_id', part)
    ),
    inChunks<any>(Array.from(docDay.keys()), (part) =>
      supabase
        .from('sales_document_lines')
        .select('document_id, product_id, sku, item_name, quantity, amount, product:Products(sku, item_name)')
        .eq('kind', 'product')
        .in('document_id', part)
    ),
  ]);
  const one = (p: any) => (Array.isArray(p) ? p[0] : p);
  return [
    ...items.map((i) => ({
      day: orderDay.get(i.order_id)!,
      product_id: i.product_id ?? null,
      sku: one(i.product)?.sku ?? null,
      name: one(i.product)?.item_name ?? null,
      quantity: i.quantity,
      amount: i.total_price,
    })),
    ...lines.map((l) => ({
      day: docDay.get(l.document_id)!,
      product_id: l.product_id ?? null,
      sku: one(l.product)?.sku ?? l.sku ?? null,
      name: one(l.product)?.item_name ?? l.item_name ?? null,
      quantity: l.quantity,
      amount: l.amount,
    })),
  ];
}

/** Fetch everything for one company's drill-down and compute. Throws on
 *  any query error — no silent partial numbers. */
export async function buildCompanyPerformance(
  supabase: SupabaseClient,
  companyId: string,
  windowFrom: Date,
  windowTo: Date
): Promise<CompanyPerformance> {
  const [companyRes, periodsRes, inputs] = await Promise.all([
    supabase
      .from('companies')
      .select('id, company_name, netsuite_number, support_fund_id, support_fund:support_fund_levels(percent), subsidiary:subsidiaries(name)')
      .eq('id', companyId)
      .single(),
    supabase.from('target_periods').select('id, period_name, start_date, end_date, target_amount').eq('company_id', companyId),
    fetchRevenueInputs(supabase, [companyId]),
  ]);
  if (companyRes.error) throw new Error(`company: ${companyRes.error.message}`);
  if (periodsRes.error) throw new Error(`periods: ${periodsRes.error.message}`);

  const productLines = await fetchEntryProductLines(supabase, inputs.entries);
  return computeCompanyMetrics({
    now: new Date(),
    company: companyRes.data,
    periods: periodsRes.data ?? [],
    entries: inputs.entries,
    productLines,
    windowFrom,
    windowTo,
  });
}
