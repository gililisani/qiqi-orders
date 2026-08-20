/**
 * Company performance — single source of truth for Done-based revenue math.
 *
 * Every consumer of "how much did a company sell in a date range" goes
 * through this module: the Company Performance report (multi-company), the
 * per-company drill-down, and target-period recalculation. All revenue is
 * DONE-based (an order counts when it was first marked Done, per
 * order_history) plus historical_sales — so numbers always agree across
 * views.
 *
 * Design: `fetchRevenueInputs` loads everything in a FIXED number of
 * queries regardless of how many companies/periods/orders are involved,
 * and THROWS on any query error — no silent partial zeros (that failure
 * mode caused the 2026-07 reporting incident). The math over the fetched
 * rows is pure and unit-tested (`computePeriodMetrics`,
 * `computeCompanyMetrics`, `computeSfBehaviorDistribution`).
 *
 * Support-fund semantics (see useOrderFormController.ts):
 * `orders.support_fund_used` is CAPPED at `credit_earned`, so what the
 * client actually claimed lives in the SF line items —
 * `order_items.total_price` WHERE `is_support_fund_item = true`.
 * Balance = earned − claimed. Positive → leftover, negative → top-up.
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
    sales: number; // done orders + historical, all time
    orders: number; // done orders count
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

/**
 * Pure per-period math. `doneOrders` and `historical` must already be
 * scoped to the period's company; an order counts when its first-Done
 * timestamp falls inside the period (orders with Done status but no
 * history row are excluded — not countable).
 */
export function computePeriodMetrics(
  now: Date,
  period: { start_date: string; end_date: string; target_amount: number | string | null },
  doneOrders: Array<{ id: string; total_value?: number | null; credit_earned?: number | null }>,
  firstDone: Map<string, Date>,
  sfUsedByOrder: Map<string, number>,
  historical: Array<{ amount: number | string | null; sale_date: string; support_fund?: number | string | null }>
): PeriodMetrics {
  const startDate = new Date(`${period.start_date}T00:00:00.000Z`);
  const endDate = new Date(`${period.end_date}T23:59:59.999Z`);
  const target = Number(period.target_amount) || 0;

  let actual = 0;
  let sfEarned = 0;
  let sfUsed = 0;
  for (const order of doneOrders) {
    const doneAt = firstDone.get(order.id);
    if (!doneAt || doneAt < startDate || doneAt > endDate) continue;
    actual += Number(order.total_value) || 0;
    sfEarned += Number(order.credit_earned) || 0;
    sfUsed += sfUsedByOrder.get(order.id) ?? 0;
  }
  for (const sale of historical) {
    if (sale.sale_date >= period.start_date && sale.sale_date <= period.end_date) {
      actual += Number(sale.amount) || 0;
      // Historical SF = the NS discount captured on import (or typed in) —
      // counts toward "earned" so pre-Hub eras show their real SF benefit.
      sfEarned += Number(sale.support_fund) || 0;
    }
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

/** First-Done timestamp per order — "first Done wins" is the canonical
 *  done-date rule everywhere. Rows must be sorted created_at ascending. */
export function buildFirstDoneMap(
  historyRows: Array<{ order_id: string; created_at: string }>
): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const h of historyRows) {
    if (!map.has(h.order_id)) map.set(h.order_id, new Date(h.created_at));
  }
  return map;
}

/** Sum SF line items per order — the canonical "what the client claimed". */
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
 * Per-ORDER redemption behavior across enrolled companies. An order counts
 * when its first-Done date falls inside one of its company's enrolled
 * periods. Orders with zero earned AND zero claimed carry no signal and
 * are skipped.
 */
export function computeSfBehaviorDistribution(
  enrolledPeriods: Array<{ company_id: string; start_date: string; end_date: string }>,
  doneOrders: Array<{ id: string; company_id: string; credit_earned?: number | null }>,
  firstDone: Map<string, Date>,
  sfUsedByOrder: Map<string, number>
): SfBehaviorDistribution {
  const periodsByCompany = new Map<string, Array<{ s: Date; e: Date }>>();
  for (const p of enrolledPeriods) {
    const list = periodsByCompany.get(p.company_id) ?? [];
    list.push({
      s: new Date(`${p.start_date}T00:00:00.000Z`),
      e: new Date(`${p.end_date}T23:59:59.999Z`),
    });
    periodsByCompany.set(p.company_id, list);
  }

  let under = 0,
    full = 0,
    over = 0;
  let topUpSum = 0,
    leftoverSum = 0;
  let total = 0;

  for (const o of doneOrders) {
    const doneAt = firstDone.get(o.id);
    if (!doneAt) continue;
    const ranges = periodsByCompany.get(o.company_id) ?? [];
    if (!ranges.some((r) => doneAt >= r.s && doneAt <= r.e)) continue;

    const earned = Number(o.credit_earned) || 0;
    const claimed = sfUsedByOrder.get(o.id) ?? 0;
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

interface RawInputs {
  now: Date;
  company: any;
  periods: any[];
  doneOrders: any[]; // id, total_value, credit_earned
  firstDone: Map<string, Date>; // order_id → first Done timestamp
  historical: any[]; // amount, sale_date, support_fund
  sfItems: any[]; // order_id, total_price (support-fund lines)
  productItems: any[]; // order_id, product_id, quantity, total_price, product meta
  // NS-imported lines of historical sales: sale_date, product_id, sku,
  // item_name, quantity, amount, product meta. Optional — older callers
  // (and companies with totals-only rows) simply have none.
  historicalItems?: any[];
  windowFrom: Date;
  windowTo: Date;
}

export function computeCompanyMetrics(inputs: RawInputs): CompanyPerformance {
  const {
    now, company, periods, doneOrders, firstDone, historical,
    sfItems, productItems, historicalItems = [], windowFrom, windowTo,
  } = inputs;

  const sfUsedByOrder = buildSfUsedByOrder(sfItems);

  // ---- To-date totals -----------------------------------------------------
  let toDateSales = 0;
  let toDateOrders = 0;
  let toDateSfEarned = 0;
  let toDateSfUsed = 0;
  for (const order of doneOrders) {
    if (!firstDone.has(order.id)) continue; // no Done timestamp → not countable
    toDateSales += Number(order.total_value) || 0;
    toDateOrders += 1;
    toDateSfEarned += Number(order.credit_earned) || 0;
    toDateSfUsed += sfUsedByOrder.get(order.id) ?? 0;
  }
  for (const sale of historical) {
    toDateSales += Number(sale.amount) || 0;
    toDateSfEarned += Number(sale.support_fund) || 0;
  }

  // ---- Per-period rows ----------------------------------------------------
  const periodRows: CompanyPeriodRow[] = periods.map((p) => {
    const m = computePeriodMetrics(now, p, doneOrders, firstDone, sfUsedByOrder, historical);
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

  // ---- Windowed metrics + product mix -------------------------------------
  const windowOrderIds = new Set<string>();
  let windowSales = 0;
  let windowSfEarned = 0;
  let windowSfUsed = 0;
  for (const order of doneOrders) {
    const doneAt = firstDone.get(order.id);
    if (!doneAt || doneAt < windowFrom || doneAt > windowTo) continue;
    windowOrderIds.add(order.id);
    windowSales += Number(order.total_value) || 0;
    windowSfEarned += Number(order.credit_earned) || 0;
    windowSfUsed += sfUsedByOrder.get(order.id) ?? 0;
  }
  const windowFromDay = windowFrom.toISOString().slice(0, 10);
  const windowToDay = windowTo.toISOString().slice(0, 10);
  for (const sale of historical) {
    if (sale.sale_date >= windowFromDay && sale.sale_date <= windowToDay) {
      windowSales += Number(sale.amount) || 0;
      windowSfEarned += Number(sale.support_fund) || 0;
    }
  }

  const productAgg = new Map<string, TopProductRow>();
  let windowUnits = 0;
  for (const item of productItems) {
    if (!windowOrderIds.has(item.order_id)) continue;
    const units = Number(item.quantity) || 0;
    const revenue = Number(item.total_price) || 0;
    windowUnits += units;
    const key = String(item.product_id ?? item.product?.item_name ?? 'unknown');
    const entry = productAgg.get(key) ?? {
      productId: item.product_id ?? null,
      sku: item.product?.sku ?? null,
      name: item.product?.item_name ?? null,
      units: 0,
      revenue: 0,
    };
    entry.units += units;
    entry.revenue += revenue;
    productAgg.set(key, entry);
  }
  // Historical (NS-imported) lines join the same mix, keyed by product_id
  // when the SKU matched the catalog — so pre-Hub and Hub volumes of the
  // same product merge into one row.
  for (const item of historicalItems) {
    if (item.sale_date < windowFromDay || item.sale_date > windowToDay) continue;
    const units = Number(item.quantity) || 0;
    const revenue = Number(item.amount) || 0;
    windowUnits += units;
    const key = String(item.product_id ?? item.sku ?? item.item_name ?? 'unknown');
    const entry = productAgg.get(key) ?? {
      productId: item.product_id ?? null,
      sku: item.product?.sku ?? item.sku ?? null,
      name: item.product?.item_name ?? item.item_name ?? null,
      units: 0,
      revenue: 0,
    };
    entry.units += units;
    entry.revenue += revenue;
    productAgg.set(key, entry);
  }
  const allProducts = Array.from(productAgg.values()).sort((a, b) => b.revenue - a.revenue);

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
      sfPercent:
        (Array.isArray(company.support_fund) ? company.support_fund[0] : company.support_fund)
          ?.percent ?? null,
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
      orders: windowOrderIds.size,
      units: windowUnits,
      topProducts: allProducts.slice(0, 10),
      productCount: allProducts.length,
      sfEarned: windowSfEarned,
      sfUsed: windowSfUsed,
    },
  };
}

export interface RevenueInputs {
  doneOrders: Array<{
    id: string;
    company_id: string;
    total_value: number | null;
    credit_earned: number | null;
  }>;
  firstDone: Map<string, Date>; // order_id → first Done timestamp
  sfItems: Array<{ order_id: string; total_price: number | null }>;
  historical: Array<{ company_id: string; amount: number | string | null; sale_date: string }>;
}

/**
 * Batched fetch of everything needed to compute Done-based revenue for a
 * set of companies — 4 queries total, regardless of company/period/order
 * count. Throws on any query error: callers must never render partial
 * zeros as real numbers.
 */
export async function fetchRevenueInputs(
  supabase: SupabaseClient,
  companyIds: string[]
): Promise<RevenueInputs> {
  if (companyIds.length === 0) {
    return { doneOrders: [], firstDone: new Map(), sfItems: [], historical: [] };
  }

  const [ordersRes, historicalRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id, company_id, total_value, credit_earned')
      .eq('status', 'Done')
      .in('company_id', companyIds),
    supabase
      .from('historical_sales')
      .select('company_id, amount, sale_date, support_fund')
      .in('company_id', companyIds),
  ]);
  if (ordersRes.error) throw new Error(`orders: ${ordersRes.error.message}`);
  if (historicalRes.error) throw new Error(`historical: ${historicalRes.error.message}`);

  const doneOrders = (ordersRes.data ?? []) as RevenueInputs['doneOrders'];
  const orderIds = doneOrders.map((o) => o.id);

  let firstDone = new Map<string, Date>();
  let sfItems: RevenueInputs['sfItems'] = [];
  if (orderIds.length > 0) {
    const [historyRes, sfRes] = await Promise.all([
      supabase
        .from('order_history')
        .select('order_id, created_at')
        .in('order_id', orderIds)
        .eq('status_to', 'Done')
        .order('created_at', { ascending: true }),
      supabase
        .from('order_items')
        .select('order_id, total_price')
        .in('order_id', orderIds)
        .eq('is_support_fund_item', true),
    ]);
    if (historyRes.error) throw new Error(`history: ${historyRes.error.message}`);
    if (sfRes.error) throw new Error(`sf items: ${sfRes.error.message}`);

    firstDone = buildFirstDoneMap(historyRes.data ?? []);
    sfItems = (sfRes.data ?? []) as RevenueInputs['sfItems'];
  }

  return { doneOrders, firstDone, sfItems, historical: historicalRes.data ?? [] };
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
    supabase
      .from('target_periods')
      .select('id, period_name, start_date, end_date, target_amount')
      .eq('company_id', companyId),
    fetchRevenueInputs(supabase, [companyId]),
  ]);
  if (companyRes.error) throw new Error(`company: ${companyRes.error.message}`);
  if (periodsRes.error) throw new Error(`periods: ${periodsRes.error.message}`);

  const orderIds = inputs.doneOrders.map((o) => o.id);
  let productItems: any[] = [];
  if (orderIds.length > 0) {
    const itemsRes = await supabase
      .from('order_items')
      .select('order_id, product_id, quantity, total_price, product:Products(sku, item_name)')
      .in('order_id', orderIds);
    if (itemsRes.error) throw new Error(`items: ${itemsRes.error.message}`);
    productItems = itemsRes.data ?? [];
  }

  // NS-imported lines of this company's historical sales (inner join scopes
  // by company; the parent's sale_date is flattened for window filtering).
  const histItemsRes = await supabase
    .from('historical_sale_items')
    .select('product_id, sku, item_name, quantity, amount, product:Products(sku, item_name), sale:historical_sales!inner(company_id, sale_date)')
    .eq('sale.company_id', companyId);
  if (histItemsRes.error) throw new Error(`historical items: ${histItemsRes.error.message}`);
  const historicalItems = (histItemsRes.data ?? []).map((row: any) => {
    const sale = Array.isArray(row.sale) ? row.sale[0] : row.sale;
    return { ...row, sale_date: sale?.sale_date ?? '' };
  });

  return computeCompanyMetrics({
    now: new Date(),
    company: companyRes.data,
    periods: periodsRes.data ?? [],
    doneOrders: inputs.doneOrders,
    firstDone: inputs.firstDone,
    historical: inputs.historical,
    sfItems: inputs.sfItems,
    productItems,
    historicalItems,
    windowFrom,
    windowTo,
  });
}
