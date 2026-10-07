import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';

/**
 * GET /api/reports/executive?window=30d|90d|ytd|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns the full payload backing /admin/reports in a single shot:
 *   { period, prevPeriod, kpis, trend, funnel, topCompanies, topProducts }
 *
 * Data sources:
 *   - Sales / Active Partners / Top Companies / Top Products / Trend /
 *     Support Fund Used / Invoices / Avg invoice value: the SALES LEDGER
 *     (sales_documents — what NetSuite billed, by document date, credit
 *     memos negative; owner 2026-10-06).
 *   - Order Status Funnel: Hub orders, live (order flow, not sales).
 *
 * Presets (30d / 90d / ytd) read pre-rolled MVs; custom windows aggregate
 * live (slower, exact, admin-only so volume is low).
 */

type WindowKey = '30d' | '90d' | 'this-month' | 'last-month' | 'ytd' | 'custom';

const INVOICE_TYPES = ['invoice', 'cash_sale'];

function periodRange(window: WindowKey, fromParam: string | null, toParam: string | null) {
  const now = new Date();
  const to = new Date(now);
  let from = new Date(now);

  if (window === '30d') {
    from.setUTCDate(from.getUTCDate() - 30);
  } else if (window === '90d') {
    from.setUTCDate(from.getUTCDate() - 90);
  } else if (window === 'this-month') {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  } else if (window === 'last-month') {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    to.setTime(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
  } else if (window === 'ytd') {
    from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  } else {
    if (!fromParam || !toParam) {
      throw new Error('custom window requires from and to');
    }
    from = new Date(`${fromParam}T00:00:00.000Z`);
    to.setTime(new Date(`${toParam}T23:59:59.999Z`).getTime());
  }

  const spanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);

  return { from, to, prevFrom, prevTo };
}

interface DailyRow {
  day: string;
  source: string;
  orders: number | string | null; // invoices + cash sales
  revenue: number | string | null; // all documents (credit memos negative)
  invoice_revenue: number | string | null; // invoices + cash sales only
  support_fund_used: number | string | null;
}

interface DailyAgg {
  revenue: number;          // billed sales, net of credit memos
  supportFundUsed: number;  // redeemed on the documents
  orders: number;           // invoices + cash sales
  ordersRevenue: number;    // their sales — numerator of the average invoice value
}

function aggregateDaily(rows: DailyRow[]): Map<string, DailyAgg> {
  const out = new Map<string, DailyAgg>();
  for (const r of rows) {
    const entry = out.get(r.day) ?? {
      revenue: 0,
      supportFundUsed: 0,
      orders: 0,
      ordersRevenue: 0,
    };
    const rev = Number(r.revenue) || 0;
    const sf = Number(r.support_fund_used) || 0;
    const ord = Number(r.orders) || 0;
    entry.revenue += rev;
    entry.supportFundUsed += sf;
    entry.orders += ord;
    entry.ordersRevenue += Number(r.invoice_revenue) || 0;
    out.set(r.day, entry);
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'insights');
    const { searchParams } = new URL(request.url);
    const window = (searchParams.get('window') ?? 'this-month') as WindowKey;
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const { from, to, prevFrom, prevTo } = periodRange(window, fromParam, toParam);
    const supabase = createServiceRoleClient();

    // --- KPIs + sales trend: from mv_daily_sales (the sales ledger). ---
    const fetchDaily = () =>
      Promise.all([
        supabase
          .from('mv_daily_sales')
          .select('day, source, orders, revenue, invoice_revenue, support_fund_used')
          .gte('day', from.toISOString().slice(0, 10))
          .lte('day', to.toISOString().slice(0, 10))
          .order('day', { ascending: true }),
        supabase
          .from('mv_daily_sales')
          .select('day, source, orders, revenue, invoice_revenue, support_fund_used')
          .gte('day', prevFrom.toISOString().slice(0, 10))
          .lte('day', prevTo.toISOString().slice(0, 10)),
      ]);

    let [{ data: dailyRows, error: dailyErr }, { data: prevRows, error: prevErr }] =
      await fetchDaily();

    if (dailyErr) throw dailyErr;
    if (prevErr) throw prevErr;

    // Self-healing: the MVs are refreshed by a nightly cron, but if that ever
    // breaks (this exact bug froze the reports at 2026-05-21 once), detect
    // staleness and refresh inline rather than serving zeros.
    const { data: newestRow } = await supabase
      .from('mv_daily_sales')
      .select('day')
      .order('day', { ascending: false })
      .limit(1);
    const newestDay = newestRow?.[0]?.day as string | undefined;
    const staleCutoff = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
    if (!newestDay || newestDay < staleCutoff) {
      const { error: refreshErr } = await supabase.rpc('refresh_executive_reports');
      if (!refreshErr) {
        [{ data: dailyRows, error: dailyErr }, { data: prevRows, error: prevErr }] =
          await fetchDaily();
        if (dailyErr) throw dailyErr;
        if (prevErr) throw prevErr;
      } else {
        console.error('executive report: stale MVs and refresh failed:', refreshErr.message);
      }
    }

    const dailyAgg = aggregateDaily((dailyRows ?? []) as DailyRow[]);
    const prevAgg = aggregateDaily((prevRows ?? []) as DailyRow[]);

    const trend = Array.from(dailyAgg.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, v]) => ({
        day,
        revenue: v.revenue,
        supportFundUsed: v.supportFundUsed,
        orders: v.orders,
      }));

    let totalRevenue = 0;
    let totalSupportFund = 0;
    let totalOrders = 0;
    let totalOrdersRevenue = 0;
    for (const v of dailyAgg.values()) {
      totalRevenue += v.revenue;
      totalSupportFund += v.supportFundUsed;
      totalOrders += v.orders;
      totalOrdersRevenue += v.ordersRevenue;
    }
    const aov = totalOrders > 0 ? totalOrdersRevenue / totalOrders : 0;

    let prevRevenue = 0;
    let prevOrders = 0;
    let prevOrdersRevenue = 0;
    let prevSupportFund = 0;
    for (const v of prevAgg.values()) {
      prevRevenue += v.revenue;
      prevOrders += v.orders;
      prevOrdersRevenue += v.ordersRevenue;
      prevSupportFund += v.supportFundUsed;
    }
    const prevAov = prevOrders > 0 ? prevOrdersRevenue / prevOrders : 0;

    // --- Active partners: companies invoiced in the period. ---
    const partnersIn = async (a: Date, b: Date) => {
      const { data, error } = await supabase
        .from('sales_documents')
        .select('company_id')
        .in('doc_type', INVOICE_TYPES)
        .gte('doc_date', a.toISOString().slice(0, 10))
        .lte('doc_date', b.toISOString().slice(0, 10))
        .range(0, 9999);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.company_id).filter(Boolean)).size;
    };
    const [activePartners, prevActivePartners] = await Promise.all([
      partnersIn(from, to),
      partnersIn(prevFrom, prevTo),
    ]);

    // --- Order status funnel: live, current period, orders only. ---
    const { data: funnelRows, error: funnelErr } = await supabase
      .from('orders')
      .select('status, total_value')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString());

    if (funnelErr) throw funnelErr;

    const funnelMap = new Map<string, { count: number; value: number }>();
    for (const row of funnelRows ?? []) {
      const key = row.status || 'Unknown';
      const cur = funnelMap.get(key) ?? { count: 0, value: 0 };
      cur.count += 1;
      cur.value += Number(row.total_value) || 0;
      funnelMap.set(key, cur);
    }
    const STATUS_ORDER = ['Draft', 'Open', 'In Process', 'Ready', 'Done', 'Cancelled'];
    const funnel = STATUS_ORDER
      .filter((s) => funnelMap.has(s))
      .map((s) => ({ status: s, count: funnelMap.get(s)!.count, value: funnelMap.get(s)!.value }));

    // --- Top companies + products: MV when window is preset, live otherwise. ---
    const usePresetMv = window === '30d' || window === '90d' || window === 'ytd';

    let topCompanies: Array<{ companyId: string; name: string; orders: number; revenue: number }> = [];
    let topProducts: Array<{ productId: number; sku: string | null; name: string | null; units: number; revenue: number }> = [];

    if (usePresetMv) {
      // PostgREST can't auto-embed across materialized views (no FK
      // metadata), so query the MVs first then batch-fetch the names
      // separately. Also can't GROUP BY in PostgREST — sum per company
      // in JS (at most a few hundred companies × 2 sources, fast).
      const [companiesRes, productsRes] = await Promise.all([
        supabase
          .from('mv_company_sales')
          .select('company_id, source, orders, revenue')
          .eq('window_key', window),
        supabase
          .from('mv_product_sales')
          .select('product_id, units, revenue')
          .eq('window_key', window)
          .order('revenue', { ascending: false })
          .limit(10),
      ]);

      if (companiesRes.error) throw companiesRes.error;
      if (productsRes.error) throw productsRes.error;

      const compAgg = new Map<string, { orders: number; revenue: number }>();
      for (const r of (companiesRes.data ?? []) as any[]) {
        if (!r.company_id) continue;
        const entry = compAgg.get(r.company_id) ?? { orders: 0, revenue: 0 };
        entry.orders += Number(r.orders) || 0;
        entry.revenue += Number(r.revenue) || 0;
        compAgg.set(r.company_id, entry);
      }
      const topCompanyIds = Array.from(compAgg.entries())
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 10)
        .map(([id]) => id);

      const topProductIds = ((productsRes.data ?? []) as any[])
        .map((r) => r.product_id)
        .filter((v) => v != null);

      const [companyNamesRes, productNamesRes] = await Promise.all([
        topCompanyIds.length
          ? supabase.from('companies').select('id, company_name').in('id', topCompanyIds)
          : Promise.resolve({ data: [], error: null } as any),
        topProductIds.length
          ? supabase.from('Products').select('id, sku, item_name').in('id', topProductIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (companyNamesRes.error) throw companyNamesRes.error;
      if (productNamesRes.error) throw productNamesRes.error;

      const companyNameById = new Map<string, string>(
        (companyNamesRes.data ?? []).map((c: any) => [c.id, c.company_name ?? 'Unknown']),
      );
      const productById = new Map<number, { sku: string | null; name: string | null }>(
        (productNamesRes.data ?? []).map((p: any) => [
          p.id,
          { sku: p.sku ?? null, name: p.item_name ?? null },
        ]),
      );

      topCompanies = topCompanyIds.map((id) => ({
        companyId: id,
        name: companyNameById.get(id) ?? 'Unknown',
        orders: compAgg.get(id)!.orders,
        revenue: compAgg.get(id)!.revenue,
      }));

      topProducts = ((productsRes.data ?? []) as any[]).map((r) => {
        const meta = productById.get(r.product_id) ?? { sku: null, name: null };
        return {
          productId: r.product_id,
          sku: meta.sku,
          name: meta.name,
          units: Number(r.units) || 0,
          revenue: Number(r.revenue) || 0,
        };
      });
    } else {
      // Custom window: live aggregate over the sales ledger.
      const fromDay = from.toISOString().slice(0, 10);
      const toDay = to.toISOString().slice(0, 10);
      const [liveDocsRes, liveLinesRes] = await Promise.all([
        supabase
          .from('sales_documents')
          .select('company_id, doc_type, sales_amount, companies:company_id(company_name)')
          .gte('doc_date', fromDay)
          .lte('doc_date', toDay)
          .range(0, 19999),
        supabase
          .from('sales_document_lines')
          .select('product_id, quantity, amount, Products:product_id(sku, item_name), doc:sales_documents!inner(doc_date)')
          .eq('kind', 'product')
          .not('product_id', 'is', null)
          .gte('doc.doc_date', fromDay)
          .lte('doc.doc_date', toDay)
          .range(0, 49999),
      ]);

      if (liveDocsRes.error) throw liveDocsRes.error;
      if (liveLinesRes.error) throw liveLinesRes.error;

      const compMap = new Map<string, { name: string; orders: number; revenue: number }>();
      for (const d of liveDocsRes.data ?? []) {
        if (!d.company_id) continue;
        const entry = compMap.get(d.company_id) ?? {
          name: (d as any).companies?.company_name ?? 'Unknown',
          orders: 0,
          revenue: 0,
        };
        if (INVOICE_TYPES.includes(d.doc_type)) entry.orders += 1;
        entry.revenue += Number(d.sales_amount) || 0;
        compMap.set(d.company_id, entry);
      }
      topCompanies = Array.from(compMap.entries())
        .map(([companyId, v]) => ({ companyId, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const prodMap = new Map<number, { sku: string | null; name: string | null; units: number; revenue: number }>();
      for (const it of liveLinesRes.data ?? []) {
        if (it.product_id == null) continue;
        const meta = Array.isArray((it as any).Products) ? (it as any).Products[0] : (it as any).Products;
        const entry = prodMap.get(it.product_id) ?? {
          sku: meta?.sku ?? null,
          name: meta?.item_name ?? null,
          units: 0,
          revenue: 0,
        };
        entry.units += Number(it.quantity) || 0;
        entry.revenue += Number(it.amount) || 0;
        prodMap.set(it.product_id, entry);
      }
      topProducts = Array.from(prodMap.entries())
        .map(([productId, v]) => ({ productId, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);
    }

    const pct = (curr: number, prev: number): number | null => {
      if (!prev) return curr > 0 ? null : 0;
      return ((curr - prev) / prev) * 100;
    };

    return NextResponse.json({
      period: { window, from: from.toISOString(), to: to.toISOString() },
      prevPeriod: { from: prevFrom.toISOString(), to: prevTo.toISOString() },
      kpis: {
        totalSales: { value: totalRevenue, deltaPct: pct(totalRevenue, prevRevenue) },
        activePartners: { value: activePartners, deltaPct: pct(activePartners, prevActivePartners) },
        aov: { value: aov, deltaPct: pct(aov, prevAov) },
        supportFundUsed: { value: totalSupportFund, deltaPct: pct(totalSupportFund, prevSupportFund) },
        orders: { value: totalOrders, deltaPct: pct(totalOrders, prevOrders) },
      },
      trend,
      funnel,
      topCompanies,
      topProducts,
    });
  } catch (err: any) {
    const msg = err?.message ?? 'Unknown error';
    const status = msg === 'Not authenticated' || msg === 'Forbidden' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
