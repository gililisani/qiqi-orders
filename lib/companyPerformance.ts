/**
 * Company performance drill-down — batched builder.
 *
 * Loads everything about one company in a FIXED number of queries (6),
 * regardless of how many periods/orders it has — deliberately unlike the
 * report route's per-period query pattern. All revenue on this page is
 * DONE-based (an order counts when it was first marked Done, per
 * order_history) plus historical_sales — the same definition as the
 * Company Performance report and target periods, so numbers always agree.
 *
 * The pure computation over the fetched rows lives in computeCompanyMetrics
 * (unit-tested); the async wrapper only fetches.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type PeriodStatus =
  | 'Not Started'
  | 'Ahead'
  | 'On Track'
  | 'Slipping'
  | 'Complete'
  | 'At Risk';

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
  };
}

/** Single source of truth for period status — used by the Company
 *  Performance report route AND this builder. Change thresholds here only. */
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
  if (now > endDate) return actual >= target ? 'Complete' : 'At Risk';
  if (progressPct >= expectedPct + 5) return 'Ahead';
  if (progressPct < expectedPct - 20) return 'Slipping';
  return 'On Track';
}

interface RawInputs {
  now: Date;
  company: any;
  periods: any[];
  doneOrders: any[]; // id, total_value, credit_earned
  firstDone: Map<string, Date>; // order_id → first Done timestamp
  historical: any[]; // amount, sale_date
  sfItems: any[]; // order_id, total_price (support-fund lines)
  productItems: any[]; // order_id, product_id, quantity, total_price, product meta
  windowFrom: Date;
  windowTo: Date;
}

export function computeCompanyMetrics(inputs: RawInputs): CompanyPerformance {
  const {
    now, company, periods, doneOrders, firstDone, historical,
    sfItems, productItems, windowFrom, windowTo,
  } = inputs;

  const sfUsedByOrder = new Map<string, number>();
  for (const item of sfItems) {
    sfUsedByOrder.set(
      item.order_id,
      (sfUsedByOrder.get(item.order_id) ?? 0) + (Number(item.total_price) || 0)
    );
  }

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
  for (const sale of historical) toDateSales += Number(sale.amount) || 0;

  // ---- Per-period rows ----------------------------------------------------
  const periodRows: CompanyPeriodRow[] = periods.map((p) => {
    const startDate = new Date(`${p.start_date}T00:00:00.000Z`);
    const endDate = new Date(`${p.end_date}T23:59:59.999Z`);
    const target = Number(p.target_amount) || 0;

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
      if (sale.sale_date >= p.start_date && sale.sale_date <= p.end_date) {
        actual += Number(sale.amount) || 0;
      }
    }

    const daysTotal = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000));
    const daysElapsed = Math.max(
      0,
      Math.min(daysTotal, Math.ceil((Math.min(now.getTime(), endDate.getTime()) - startDate.getTime()) / 86400000))
    );
    const progressPct = target > 0 ? (actual / target) * 100 : 0;
    const expectedPct = (daysElapsed / daysTotal) * 100;

    return {
      periodId: p.id,
      periodName: p.period_name ?? '',
      startDate: p.start_date,
      endDate: p.end_date,
      target,
      actual,
      progressPct,
      expectedPct,
      status: classifyStatus(now, startDate, endDate, target, actual, progressPct, expectedPct),
      sfEarned,
      sfUsed,
      sfBalance: sfEarned - sfUsed,
    };
  });

  // ---- Windowed metrics + product mix -------------------------------------
  const windowOrderIds = new Set<string>();
  let windowSales = 0;
  for (const order of doneOrders) {
    const doneAt = firstDone.get(order.id);
    if (!doneAt || doneAt < windowFrom || doneAt > windowTo) continue;
    windowOrderIds.add(order.id);
    windowSales += Number(order.total_value) || 0;
  }
  const windowFromDay = windowFrom.toISOString().slice(0, 10);
  const windowToDay = windowTo.toISOString().slice(0, 10);
  for (const sale of historical) {
    if (sale.sale_date >= windowFromDay && sale.sale_date <= windowToDay) {
      windowSales += Number(sale.amount) || 0;
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
    periods: periodRows.sort((a, b) => (a.startDate < b.startDate ? -1 : 1)),
    window: {
      from: windowFrom.toISOString(),
      to: windowTo.toISOString(),
      sales: windowSales,
      orders: windowOrderIds.size,
      units: windowUnits,
      topProducts: allProducts.slice(0, 10),
      productCount: allProducts.length,
    },
  };
}

/** Fetch everything for one company (6 queries) and compute. Throws on any
 *  query error — no silent partial numbers. */
export async function buildCompanyPerformance(
  supabase: SupabaseClient,
  companyId: string,
  windowFrom: Date,
  windowTo: Date
): Promise<CompanyPerformance> {
  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .select('id, company_name, netsuite_number, support_fund_id, subsidiary:subsidiaries(name)')
    .eq('id', companyId)
    .single();
  if (companyErr) throw new Error(`company: ${companyErr.message}`);

  const [periodsRes, ordersRes, historicalRes] = await Promise.all([
    supabase
      .from('target_periods')
      .select('id, period_name, start_date, end_date, target_amount')
      .eq('company_id', companyId),
    supabase
      .from('orders')
      .select('id, total_value, credit_earned')
      .eq('company_id', companyId)
      .eq('status', 'Done'),
    supabase
      .from('historical_sales')
      .select('amount, sale_date')
      .eq('company_id', companyId),
  ]);
  if (periodsRes.error) throw new Error(`periods: ${periodsRes.error.message}`);
  if (ordersRes.error) throw new Error(`orders: ${ordersRes.error.message}`);
  if (historicalRes.error) throw new Error(`historical: ${historicalRes.error.message}`);

  const doneOrders = ordersRes.data ?? [];
  const orderIds = doneOrders.map((o: any) => o.id);

  let firstDone = new Map<string, Date>();
  let sfItems: any[] = [];
  let productItems: any[] = [];
  if (orderIds.length > 0) {
    const [historyRes, sfRes, itemsRes] = await Promise.all([
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
      supabase
        .from('order_items')
        .select('order_id, product_id, quantity, total_price, product:Products(sku, item_name)')
        .in('order_id', orderIds),
    ]);
    if (historyRes.error) throw new Error(`history: ${historyRes.error.message}`);
    if (sfRes.error) throw new Error(`sf items: ${sfRes.error.message}`);
    if (itemsRes.error) throw new Error(`items: ${itemsRes.error.message}`);

    for (const h of historyRes.data ?? []) {
      if (!firstDone.has(h.order_id)) firstDone.set(h.order_id, new Date(h.created_at));
    }
    sfItems = sfRes.data ?? [];
    productItems = itemsRes.data ?? [];
  }

  return computeCompanyMetrics({
    now: new Date(),
    company,
    periods: periodsRes.data ?? [],
    doneOrders,
    firstDone,
    historical: historicalRes.data ?? [],
    sfItems,
    productItems,
    windowFrom,
    windowTo,
  });
}
