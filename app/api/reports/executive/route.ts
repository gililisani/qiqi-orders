import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';

/**
 * GET /api/reports/executive?window=30d|90d|ytd|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns the full payload backing /admin/reports in a single shot:
 *   { period, prevPeriod, kpis, trend, funnel, topCompanies, topProducts }
 *
 * - `window` chooses a preset; if `custom`, `from`/`to` are required.
 * - 30d/90d/ytd presets hit the pre-rolled MVs (mv_company_sales,
 *   mv_product_sales). Custom windows fall back to live aggregation —
 *   slower but exact, and gated by the admin guard so volume is low.
 * - The status funnel always queries `orders` live.
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

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const window = (searchParams.get('window') ?? '30d') as WindowKey;
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const { from, to, prevFrom, prevTo } = periodRange(window, fromParam, toParam);
    const supabase = createServiceRoleClient();

    // --- KPIs + sales trend: from mv_daily_sales (works for every window). ---
    const [{ data: dailyRows, error: dailyErr }, { data: prevRows, error: prevErr }] =
      await Promise.all([
        supabase
          .from('mv_daily_sales')
          .select('day, orders, revenue, support_fund_used')
          .gte('day', from.toISOString().slice(0, 10))
          .lte('day', to.toISOString().slice(0, 10))
          .order('day', { ascending: true }),
        supabase
          .from('mv_daily_sales')
          .select('orders, revenue')
          .gte('day', prevFrom.toISOString().slice(0, 10))
          .lte('day', prevTo.toISOString().slice(0, 10)),
      ]);

    if (dailyErr) throw dailyErr;
    if (prevErr) throw prevErr;

    const trend = (dailyRows ?? []).map((r) => ({
      day: r.day,
      revenue: Number(r.revenue) || 0,
      supportFundUsed: Number(r.support_fund_used) || 0,
      orders: Number(r.orders) || 0,
    }));

    const totalRevenue = trend.reduce((s, r) => s + r.revenue, 0);
    const totalOrders = trend.reduce((s, r) => s + r.orders, 0);
    const totalSupportFund = trend.reduce((s, r) => s + r.supportFundUsed, 0);
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const prevRevenue = (prevRows ?? []).reduce((s, r) => s + (Number(r.revenue) || 0), 0);
    const prevOrders = (prevRows ?? []).reduce((s, r) => s + (Number(r.orders) || 0), 0);
    const prevAov = prevOrders > 0 ? prevRevenue / prevOrders : 0;

    // --- Active partners: live distinct count in period (cheap; uses index). ---
    const { data: partnerRows, error: partnerErr } = await supabase
      .from('orders')
      .select('company_id', { count: 'exact', head: false })
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .in('status', COMMITTED_STATUSES)
      .not('company_id', 'is', null);

    if (partnerErr) throw partnerErr;
    const activePartners = new Set((partnerRows ?? []).map((r) => r.company_id)).size;

    const { data: prevPartnerRows, error: prevPartnerErr } = await supabase
      .from('orders')
      .select('company_id')
      .gte('created_at', prevFrom.toISOString())
      .lte('created_at', prevTo.toISOString())
      .in('status', COMMITTED_STATUSES)
      .not('company_id', 'is', null);

    if (prevPartnerErr) throw prevPartnerErr;
    const prevActivePartners = new Set((prevPartnerRows ?? []).map((r) => r.company_id)).size;

    // --- Order status funnel: live, current period. ---
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
      const [companiesRes, productsRes] = await Promise.all([
        supabase
          .from('mv_company_sales')
          .select('company_id, orders, revenue, companies:company_id(company_name)')
          .eq('window_key', window)
          .order('revenue', { ascending: false })
          .limit(10),
        supabase
          .from('mv_product_sales')
          .select('product_id, units, revenue, Products:product_id(sku, item_name)')
          .eq('window_key', window)
          .order('revenue', { ascending: false })
          .limit(10),
      ]);

      if (companiesRes.error) throw companiesRes.error;
      if (productsRes.error) throw productsRes.error;

      topCompanies = (companiesRes.data ?? []).map((r: any) => ({
        companyId: r.company_id,
        name: r.companies?.company_name ?? 'Unknown',
        orders: Number(r.orders) || 0,
        revenue: Number(r.revenue) || 0,
      }));

      topProducts = (productsRes.data ?? []).map((r: any) => ({
        productId: r.product_id,
        sku: r.Products?.sku ?? null,
        name: r.Products?.item_name ?? null,
        units: Number(r.units) || 0,
        revenue: Number(r.revenue) || 0,
      }));
    } else {
      // Custom window: live aggregate. Pull all committed orders in range +
      // join items in app code (single round-trip each).
      const { data: liveOrders, error: liveOrdersErr } = await supabase
        .from('orders')
        .select('id, company_id, total_value, companies:company_id(company_name)')
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
        .in('status', COMMITTED_STATUSES);

      if (liveOrdersErr) throw liveOrdersErr;

      const compMap = new Map<string, { name: string; orders: number; revenue: number }>();
      for (const o of liveOrders ?? []) {
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
      topCompanies = Array.from(compMap.entries())
        .map(([companyId, v]) => ({ companyId, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const orderIds = (liveOrders ?? []).map((o) => o.id);
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
        supportFundUsed: { value: totalSupportFund, deltaPct: null },
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
