import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';

/**
 * GET /api/reports/executive?window=30d|90d|ytd|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns the full payload backing /admin/reports in a single shot:
 *   { period, prevPeriod, kpis, trend, funnel, topCompanies, topProducts }
 *
 * Data sources:
 *   - Revenue / Active Partners / Top Companies / Trend: orders (committed)
 *     UNION historical_sales (pre-NetSuite backfill table).
 *   - AOV: orders only (historical_sales has no order concept).
 *   - Top Products / Order Status Funnel / Support Fund Used: orders only.
 *
 * Presets (30d / 90d / ytd) read pre-rolled MVs; custom windows aggregate
 * live (slower, exact, admin-only so volume is low).
 */

type WindowKey = '30d' | '90d' | 'ytd' | 'custom';

const COMMITTED_STATUSES = ['Open', 'In Process', 'Ready', 'Done'];

function periodRange(window: WindowKey, fromParam: string | null, toParam: string | null) {
  const now = new Date();
  const to = new Date(now);
  let from = new Date(now);

  if (window === '30d') {
    from.setUTCDate(from.getUTCDate() - 30);
  } else if (window === '90d') {
    from.setUTCDate(from.getUTCDate() - 90);
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
  source: 'orders' | 'historical';
  orders: number | string | null;
  revenue: number | string | null;
  support_fund_used: number | string | null;
}

interface DailyAgg {
  revenue: number;          // orders + historical
  supportFundUsed: number;  // orders only (historical contributes 0)
  orders: number;           // orders only
  ordersRevenue: number;    // orders only — denominator-side of AOV
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
    if (r.source === 'orders') entry.ordersRevenue += rev;
    out.set(r.day, entry);
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const window = (searchParams.get('window') ?? '30d') as WindowKey;
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const { from, to, prevFrom, prevTo } = periodRange(window, fromParam, toParam);
    const supabase = createServiceRoleClient();

    // --- KPIs + sales trend: from mv_daily_sales (orders + historical). ---
    const [{ data: dailyRows, error: dailyErr }, { data: prevRows, error: prevErr }] =
      await Promise.all([
        supabase
          .from('mv_daily_sales')
          .select('day, source, orders, revenue, support_fund_used')
          .gte('day', from.toISOString().slice(0, 10))
          .lte('day', to.toISOString().slice(0, 10))
          .order('day', { ascending: true }),
        supabase
          .from('mv_daily_sales')
          .select('day, source, orders, revenue, support_fund_used')
          .gte('day', prevFrom.toISOString().slice(0, 10))
          .lte('day', prevTo.toISOString().slice(0, 10)),
      ]);

    if (dailyErr) throw dailyErr;
    if (prevErr) throw prevErr;

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

    // --- Active partners: union of committed-order companies + historical
    //     companies in the period. ---
    const [
      { data: orderPartnerRows, error: orderPartnerErr },
      { data: histPartnerRows, error: histPartnerErr },
      { data: prevOrderPartnerRows, error: prevOrderPartnerErr },
      { data: prevHistPartnerRows, error: prevHistPartnerErr },
    ] = await Promise.all([
      supabase
        .from('orders')
        .select('company_id')
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
        .in('status', COMMITTED_STATUSES)
        .not('company_id', 'is', null),
      supabase
        .from('historical_sales')
        .select('company_id')
        .gte('sale_date', from.toISOString().slice(0, 10))
        .lte('sale_date', to.toISOString().slice(0, 10)),
      supabase
        .from('orders')
        .select('company_id')
        .gte('created_at', prevFrom.toISOString())
        .lte('created_at', prevTo.toISOString())
        .in('status', COMMITTED_STATUSES)
        .not('company_id', 'is', null),
      supabase
        .from('historical_sales')
        .select('company_id')
        .gte('sale_date', prevFrom.toISOString().slice(0, 10))
        .lte('sale_date', prevTo.toISOString().slice(0, 10)),
    ]);

    if (orderPartnerErr) throw orderPartnerErr;
    if (histPartnerErr) throw histPartnerErr;
    if (prevOrderPartnerErr) throw prevOrderPartnerErr;
    if (prevHistPartnerErr) throw prevHistPartnerErr;

    const partnerSet = new Set<string>();
    for (const r of orderPartnerRows ?? []) if (r.company_id) partnerSet.add(r.company_id);
    for (const r of histPartnerRows ?? []) if (r.company_id) partnerSet.add(r.company_id);
    const activePartners = partnerSet.size;

    const prevPartnerSet = new Set<string>();
    for (const r of prevOrderPartnerRows ?? []) if (r.company_id) prevPartnerSet.add(r.company_id);
    for (const r of prevHistPartnerRows ?? []) if (r.company_id) prevPartnerSet.add(r.company_id);
    const prevActivePartners = prevPartnerSet.size;

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
      // Custom window: live aggregate across orders + historical_sales.
      const [liveOrdersRes, liveHistRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, company_id, total_value, companies:company_id(company_name)')
          .gte('created_at', from.toISOString())
          .lte('created_at', to.toISOString())
          .in('status', COMMITTED_STATUSES),
        supabase
          .from('historical_sales')
          .select('company_id, amount, companies:company_id(company_name)')
          .gte('sale_date', from.toISOString().slice(0, 10))
          .lte('sale_date', to.toISOString().slice(0, 10)),
      ]);

      if (liveOrdersRes.error) throw liveOrdersRes.error;
      if (liveHistRes.error) throw liveHistRes.error;
      const liveOrders = liveOrdersRes.data ?? [];

      const compMap = new Map<string, { name: string; orders: number; revenue: number }>();
      for (const o of liveOrders) {
        if (!o.company_id) continue;
        const entry = compMap.get(o.company_id) ?? {
          name: (o as any).companies?.company_name ?? 'Unknown',
          orders: 0,
          revenue: 0,
        };
        entry.orders += 1;
        entry.revenue += Number(o.total_value) || 0;
        compMap.set(o.company_id, entry);
      }
      for (const h of liveHistRes.data ?? []) {
        if (!h.company_id) continue;
        const entry = compMap.get(h.company_id) ?? {
          name: (h as any).companies?.company_name ?? 'Unknown',
          orders: 0,
          revenue: 0,
        };
        entry.revenue += Number(h.amount) || 0;
        compMap.set(h.company_id, entry);
      }
      topCompanies = Array.from(compMap.entries())
        .map(([companyId, v]) => ({ companyId, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const orderIds = liveOrders.map((o) => o.id);
      if (orderIds.length > 0) {
        const { data: liveItems, error: liveItemsErr } = await supabase
          .from('order_items')
          .select('product_id, quantity, total_price, Products:product_id(sku, item_name)')
          .in('order_id', orderIds);

        if (liveItemsErr) throw liveItemsErr;

        const prodMap = new Map<number, { sku: string | null; name: string | null; units: number; revenue: number }>();
        for (const it of liveItems ?? []) {
          if (it.product_id == null) continue;
          const entry = prodMap.get(it.product_id) ?? {
            sku: (it as any).Products?.sku ?? null,
            name: (it as any).Products?.item_name ?? null,
            units: 0,
            revenue: 0,
          };
          entry.units += Number(it.quantity) || 0;
          entry.revenue += Number(it.total_price) || 0;
          prodMap.set(it.product_id, entry);
        }
        topProducts = Array.from(prodMap.entries())
          .map(([productId, v]) => ({ productId, ...v }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10);
      }
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
