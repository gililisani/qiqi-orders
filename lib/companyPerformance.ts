/**
 * Company performance — single source of truth for revenue math.
 *
 * Every consumer of "how much did a company sell in a date range" goes
 * through this module: the Company Performance report (multi-company), the
 * per-company drill-down (admin + client), and target-period recalculation.
 *
 * Revenue = the SALES LEDGER (sales_documents): what the ERP actually
 * billed — invoices, credit memos (negative), cash sales — whether or not
 * it started as a Hub order, dated by the document (owner 2026-10-06: "a
 * sale counts when NetSuite bills it"; replaces Done orders + hand-typed
 * historical_sales). Documents dated before the client's agreement
 * (companies.contract_execution_date) never count toward targets or
 * support funds.
 *
 * Support funds come from HUB ORDERS, not billing (owner 2026-10-07: a
 * client earns support funds while placing the order). They're read from
 * the support_fund_events view — Hub orders (credit_earned + SF items
 * claimed, dated first Done) plus NetSuite-only invoices (redeemed; earned
 * estimated only before the client's first Hub order). The rule lives in
 * that view alone. Balance = earned − used.
 *
 * Design: `fetchRevenueInputs` loads everything in a FIXED number of
 * queries regardless of how many companies/periods are involved, and
 * THROWS on any query error — no silent partial zeros (that failure mode
 * caused the 2026-07 reporting incident). The math is pure and unit-tested.
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
    sales: number; // billed since the agreement (all billed when no agreement date)
    invoices: number; // invoices + cash sales since the agreement
    salesBeforeAgreement: number; // billed before the agreement — never in targets / SF
    sfEarned: number;
    sfUsed: number;
    sfBalance: number;
  };
  periods: CompanyPeriodRow[];
  window: {
    from: string;
    to: string;
    sales: number;
    invoices: number;
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


/** One ledger document as the revenue math sees it (sales_documents row, USD). */
export interface LedgerSale {
  company_id: string;
  doc_date: string; // YYYY-MM-DD
  doc_type: string; // invoice | credit_memo | cash_sale | cash_refund
  sales_amount: number | string | null;
}

/** One support_fund_events row: what a purchase earned and redeemed (USD). */
export interface SfEvent {
  company_id: string;
  day: string; // YYYY-MM-DD — first Done (Hub order) or document date
  source: string; // order | erp
  earned: number | string | null;
  used: number | string | null;
}

/** One product line of a ledger document, flattened with its document date. */
export interface LedgerProductLine {
  doc_date: string;
  product_id: number | null;
  sku: string | null;
  item_name: string | null;
  quantity: number | string | null;
  amount: number | string | null;
  product?: { sku: string | null; item_name: string | null } | null;
}

const num = (v: unknown) => Number(v) || 0;
const isInvoice = (s: Pick<LedgerSale, 'doc_type'>) => s.doc_type === 'invoice' || s.doc_type === 'cash_sale';

/**
 * Pure per-period math over ledger documents and support-fund events
 * already scoped to the period's company. A row counts when its date falls
 * inside the period (periods start at the agreement, so earlier sales never
 * count toward a target).
 */
export function computePeriodMetrics(
  now: Date,
  period: { start_date: string; end_date: string; target_amount: number | string | null },
  sales: LedgerSale[],
  sfEvents: SfEvent[] = []
): PeriodMetrics {
  const startDate = new Date(`${period.start_date}T00:00:00.000Z`);
  const endDate = new Date(`${period.end_date}T23:59:59.999Z`);
  const target = Number(period.target_amount) || 0;

  let actual = 0;
  let sfEarned = 0;
  let sfUsed = 0;
  for (const sale of sales) {
    if (sale.doc_date < period.start_date || sale.doc_date > period.end_date) continue;
    actual += num(sale.sales_amount);
  }
  for (const e of sfEvents) {
    if (e.day < period.start_date || e.day > period.end_date) continue;
    sfEarned += num(e.earned);
    sfUsed += num(e.used);
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
 *  created_at ascending. (Order-based Support Funds report only.) */
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
 *  (Order-based Support Funds report only.) */
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
 * Per-PURCHASE redemption behavior across enrolled companies: one sample per
 * support-fund event (a Done Hub order, or a NetSuite-only invoice) whose
 * date falls inside one of its company's enrolled periods. Events with zero
 * earned AND zero claimed carry no signal and are skipped.
 */
export function computeSfBehaviorDistribution(
  enrolledPeriods: Array<{ company_id: string; start_date: string; end_date: string }>,
  sfEvents: SfEvent[]
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

  for (const e of sfEvents) {
    const ranges = periodsByCompany.get(e.company_id) ?? [];
    if (!ranges.some((r) => e.day >= r.s && e.day <= r.e)) continue;
    const earned = num(e.earned);
    const claimed = num(e.used);
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
  company: any; // id, company_name, netsuite_number, support_fund_id, support_fund(percent), subsidiary(name), contract_execution_date
  periods: any[];
  sales: LedgerSale[]; // this company's ledger documents
  sfEvents?: SfEvent[]; // this company's support-fund events
  productLines: LedgerProductLine[]; // this company's product lines
  windowFrom: Date;
  windowTo: Date;
}

export function computeCompanyMetrics(inputs: RawInputs): CompanyPerformance {
  const { now, company, periods, sales, sfEvents = [], productLines, windowFrom, windowTo } = inputs;
  const sfPercent =
    (Array.isArray(company.support_fund) ? company.support_fund[0] : company.support_fund)?.percent ?? null;
  const contractDate: string | null = company.contract_execution_date ?? null;
  const sinceAgreement = (day: string) => !contractDate || day >= contractDate;

  // ---- To-date: everything since the agreement ------------------------------
  let toDateSales = 0;
  let toDateInvoices = 0;
  let toDateSfEarned = 0;
  let toDateSfUsed = 0;
  let beforeAgreement = 0;
  for (const sale of sales) {
    if (!sinceAgreement(sale.doc_date)) {
      beforeAgreement += num(sale.sales_amount);
      continue;
    }
    toDateSales += num(sale.sales_amount);
    if (isInvoice(sale)) toDateInvoices += 1;
  }
  for (const e of sfEvents) {
    if (!sinceAgreement(e.day)) continue;
    toDateSfEarned += num(e.earned);
    toDateSfUsed += num(e.used);
  }

  // ---- Per-period rows -----------------------------------------------------
  const periodRows: CompanyPeriodRow[] = periods.map((p) => {
    const m = computePeriodMetrics(now, p, sales, sfEvents);
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

  // ---- Window: everything billed in the window -----------------------------
  const windowFromDay = windowFrom.toISOString().slice(0, 10);
  const windowToDay = windowTo.toISOString().slice(0, 10);
  const inWindow = (d: string) => d >= windowFromDay && d <= windowToDay;
  let windowSales = 0;
  let windowInvoices = 0;
  let windowSfEarned = 0;
  let windowSfUsed = 0;
  for (const sale of sales) {
    if (!inWindow(sale.doc_date)) continue;
    windowSales += num(sale.sales_amount);
    if (isInvoice(sale)) windowInvoices += 1;
  }
  for (const e of sfEvents) {
    if (!inWindow(e.day)) continue;
    windowSfEarned += num(e.earned);
    windowSfUsed += num(e.used);
  }

  const productAgg = new Map<string, TopProductRow>();
  let windowUnits = 0;
  for (const line of productLines) {
    if (!inWindow(line.doc_date)) continue;
    const units = num(line.quantity);
    const revenue = num(line.amount);
    windowUnits += units;
    const key = String(line.product_id ?? line.sku ?? line.item_name ?? 'unknown');
    const entry = productAgg.get(key) ?? {
      productId: line.product_id ?? null,
      sku: line.product?.sku ?? line.sku ?? null,
      name: line.product?.item_name ?? line.item_name ?? null,
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
      invoices: toDateInvoices,
      salesBeforeAgreement: beforeAgreement,
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
      invoices: windowInvoices,
      units: windowUnits,
      topProducts: allProducts.slice(0, 10),
      productCount: allProducts.length,
      sfEarned: windowSfEarned,
      sfUsed: windowSfUsed,
    },
  };
}

export interface RevenueInputs {
  sales: LedgerSale[];
  sfEvents: SfEvent[];
  contractDateByCompany: Map<string, string | null>;
}

const SALE_COLUMNS = 'company_id, doc_date, doc_type, sales_amount';

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

/**
 * Batched fetch of the ledger and support-fund events for a set of
 * companies — three queries (paged) regardless of company/period count.
 * Throws on any query error: callers must never render partial zeros as
 * real numbers.
 */
export async function fetchRevenueInputs(supabase: SupabaseClient, companyIds: string[]): Promise<RevenueInputs> {
  if (companyIds.length === 0) return { sales: [], sfEvents: [], contractDateByCompany: new Map() };
  const [sales, sfEvents, companies] = await Promise.all([
    selectAll<LedgerSale>((a, b) =>
      supabase.from('sales_documents').select(SALE_COLUMNS).in('company_id', companyIds).order('id').range(a, b)
    ),
    selectAll<SfEvent>((a, b) =>
      supabase
        .from('support_fund_events')
        .select('company_id, day, source, earned, used')
        .in('company_id', companyIds)
        .order('day')
        .order('order_id')
        .order('document_id')
        .range(a, b)
    ),
    selectAll<{ id: string; contract_execution_date: string | null }>((a, b) =>
      supabase.from('companies').select('id, contract_execution_date').in('id', companyIds).order('id').range(a, b)
    ),
  ]);
  return {
    sales,
    sfEvents,
    contractDateByCompany: new Map(companies.map((c) => [String(c.id), c.contract_execution_date ?? null])),
  };
}

/** Fetch everything for one company's drill-down and compute. Throws on
 *  any query error — no silent partial numbers. */
export async function buildCompanyPerformance(
  supabase: SupabaseClient,
  companyId: string,
  windowFrom: Date,
  windowTo: Date
): Promise<CompanyPerformance> {
  const [companyRes, periodsRes, inputs, productLines] = await Promise.all([
    supabase
      .from('companies')
      .select(
        'id, company_name, netsuite_number, support_fund_id, contract_execution_date, support_fund:support_fund_levels(percent), subsidiary:subsidiaries(name)'
      )
      .eq('id', companyId)
      .single(),
    supabase.from('target_periods').select('id, period_name, start_date, end_date, target_amount').eq('company_id', companyId),
    fetchRevenueInputs(supabase, [companyId]),
    selectAll<any>((a, b) =>
      supabase
        .from('sales_document_lines')
        .select('id, product_id, sku, item_name, quantity, amount, product:Products(sku, item_name), doc:sales_documents!inner(company_id, doc_date)')
        .eq('kind', 'product')
        .eq('doc.company_id', companyId)
        .order('id')
        .range(a, b)
    ),
  ]);
  if (companyRes.error) throw new Error(`company: ${companyRes.error.message}`);
  if (periodsRes.error) throw new Error(`periods: ${periodsRes.error.message}`);

  return computeCompanyMetrics({
    now: new Date(),
    company: companyRes.data,
    periods: periodsRes.data ?? [],
    sales: inputs.sales,
    sfEvents: inputs.sfEvents,
    productLines: productLines.map((row: any) => {
      const doc = Array.isArray(row.doc) ? row.doc[0] : row.doc;
      const product = Array.isArray(row.product) ? row.product[0] : row.product;
      return { ...row, product, doc_date: doc?.doc_date ?? '' };
    }),
    windowFrom,
    windowTo,
  });
}
