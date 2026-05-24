import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdmin,
} from '../../../../platform/auth/guards';

/**
 * GET /api/reports/product-insights?window=30d|90d|ytd|custom&from=&to=
 *
 * Single payload powering /admin/reports/product-insights. All metrics
 * count committed orders only (Open / In Process / Ready / Done) — drafts
 * and cancellations don't move product numbers.
 *
 * Definitions:
 *   - Active SKU (period)  : a Product with ≥1 unit sold in the period.
 *   - Dead SKU              : a Product with enable=true AND zero sales in
 *                             the last 90 days (independent of the period
 *                             filter — this is its own watchlist).
 *   - New SKU               : Products.created_at within the last 90 days.
 *   - Adoption %            : buyers_of_product / total_active_partners
 *                             (active partner = company that placed any
 *                             committed order in the period).
 *
 * Heatmap is subsidiary × category revenue — one cell per pairing, joined
 * via orders → companies → subsidiaries and order_items → Products → categories.
 */

type WindowKey = '30d' | '90d' | 'ytd' | 'custom';

const COMMITTED_STATUSES = ['Open', 'In Process', 'Ready', 'Done'];
const DEAD_SKU_LOOKBACK_DAYS = 90;
const NEW_SKU_LOOKBACK_DAYS = 90;

function periodRange(
  window: WindowKey,
  fromParam: string | null,
  toParam: string | null,
) {
  const now = new Date();
  const to = new Date(now);
  let from = new Date(now);

  if (window === '30d') from.setUTCDate(from.getUTCDate() - 30);
  else if (window === '90d') from.setUTCDate(from.getUTCDate() - 90);
  else if (window === 'ytd') from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  else {
    if (!fromParam || !toParam)
      throw new Error('custom window requires from and to');
    from = new Date(`${fromParam}T00:00:00.000Z`);
    to.setTime(new Date(`${toParam}T23:59:59.999Z`).getTime());
  }
  return { from, to };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const window = (searchParams.get('window') ?? '90d') as WindowKey;
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const { from, to } = periodRange(window, fromParam, toParam);
    const supabase = createServiceRoleClient();

    // ---- 1. Pull every committed order in the period (id + company_id) ----
    const { data: ordersInPeriod, error: ordersErr } = await supabase
      .from('orders')
      .select('id, company_id')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .in('status', COMMITTED_STATUSES);
    if (ordersErr) throw ordersErr;

    const orderIds = (ordersInPeriod ?? []).map((o) => o.id);
    const orderCompany = new Map<string, string | null>();
    for (const o of ordersInPeriod ?? []) orderCompany.set(o.id, o.company_id);

    if (orderIds.length === 0) {
      return NextResponse.json(emptyPayload());
    }

    // ---- 2. Pull all line items for those orders ----
    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('order_id, product_id, quantity, total_price')
      .in('order_id', orderIds);
    if (itemsErr) throw itemsErr;

    // ---- 3. Build per-product aggregates ----
    interface ProductAgg {
      units: number;
      revenue: number;
      orderIds: Set<string>;
      buyerIds: Set<string>;
      buyerRevenue: Map<string, number>; // company_id -> revenue (to pick top buyer)
    }
    const productAgg = new Map<number, ProductAgg>();
    const activeCompanySet = new Set<string>();

    for (const it of items ?? []) {
      if (it.product_id == null) continue;
      const agg = productAgg.get(it.product_id) ?? {
        units: 0,
        revenue: 0,
        orderIds: new Set<string>(),
        buyerIds: new Set<string>(),
        buyerRevenue: new Map<string, number>(),
      };
      const qty = Number(it.quantity) || 0;
      const rev = Number(it.total_price) || 0;
      agg.units += qty;
      agg.revenue += rev;
      agg.orderIds.add(it.order_id);
      const co = orderCompany.get(it.order_id) ?? null;
      if (co) {
        agg.buyerIds.add(co);
        agg.buyerRevenue.set(co, (agg.buyerRevenue.get(co) ?? 0) + rev);
        activeCompanySet.add(co);
      }
      productAgg.set(it.product_id, agg);
    }

    const productIds = Array.from(productAgg.keys());

    // ---- 4. Resolve product + category metadata + buyer company names ----
    const [productMetaRes, categoriesRes] = await Promise.all([
      productIds.length
        ? supabase
            .from('Products')
            .select('id, sku, item_name, enable, category_id, created_at')
            .in('id', productIds)
        : Promise.resolve({ data: [], error: null } as any),
      supabase.from('categories').select('id, name').order('name'),
    ]);
    if (productMetaRes.error) throw productMetaRes.error;
    if (categoriesRes.error) throw categoriesRes.error;

    const productMetaById = new Map<number, any>(
      (productMetaRes.data ?? []).map((p: any) => [p.id, p]),
    );
    const categoryById = new Map<string, string>(
      (categoriesRes.data ?? []).map((c: any) => [c.id, c.name]),
    );

    // Buyer company names — only fetch top-buyer ids that we'll display.
    const topBuyerIdSet = new Set<string>();
    const productTopBuyerId = new Map<number, string | null>();
    for (const [pid, agg] of productAgg) {
      let bestId: string | null = null;
      let bestRev = -1;
      for (const [coId, rev] of agg.buyerRevenue) {
        if (rev > bestRev) {
          bestRev = rev;
          bestId = coId;
        }
      }
      productTopBuyerId.set(pid, bestId);
      if (bestId) topBuyerIdSet.add(bestId);
    }

    const companyIds = Array.from(
      new Set<string>([...activeCompanySet, ...topBuyerIdSet]),
    );
    const { data: companyRows, error: companyErr } = companyIds.length
      ? await supabase
          .from('companies')
          .select('id, company_name, subsidiary_id')
          .in('id', companyIds)
      : ({ data: [], error: null } as any);
    if (companyErr) throw companyErr;

    const companyById = new Map<string, { name: string; subsidiaryId: string | null }>(
      (companyRows ?? []).map((c: any) => [
        c.id,
        { name: c.company_name ?? 'Unknown', subsidiaryId: c.subsidiary_id ?? null },
      ]),
    );

    // ---- 5. Build the products[] payload ----
    const totalActivePartners = activeCompanySet.size;

    const products = productIds
      .map((pid) => {
        const agg = productAgg.get(pid)!;
        const meta = productMetaById.get(pid);
        const topBuyerId = productTopBuyerId.get(pid) ?? null;
        const topBuyer = topBuyerId ? companyById.get(topBuyerId)?.name ?? null : null;
        return {
          productId: pid,
          sku: meta?.sku ?? null,
          name: meta?.item_name ?? null,
          category: meta?.category_id ? categoryById.get(meta.category_id) ?? null : null,
          categoryId: meta?.category_id ?? null,
          units: agg.units,
          revenue: agg.revenue,
          orders: agg.orderIds.size,
          buyers: agg.buyerIds.size,
          topBuyer,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    // ---- 6. Top 10 + category mix ----
    const topProducts = products.slice(0, 10).map((p) => ({
      productId: p.productId,
      sku: p.sku,
      name: p.name,
      units: p.units,
      revenue: p.revenue,
    }));

    const categoryAgg = new Map<string, { name: string; revenue: number; units: number }>();
    for (const p of products) {
      const key = p.categoryId ?? '__uncategorized__';
      const name = p.category ?? 'Uncategorized';
      const entry = categoryAgg.get(key) ?? { name, revenue: 0, units: 0 };
      entry.revenue += p.revenue;
      entry.units += p.units;
      categoryAgg.set(key, entry);
    }
    const categoryMix = Array.from(categoryAgg.entries())
      .map(([categoryId, v]) => ({ categoryId, ...v }))
      .sort((a, b) => b.revenue - a.revenue);

    // ---- 7. KPIs ----
    const totalUnits = products.reduce((s, p) => s + p.units, 0);
    const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
    const activeSkus = products.length;

    // ---- 8. Dead SKUs (independent of period — last 90d watchlist) ----
    const deadCutoff = new Date();
    deadCutoff.setUTCDate(deadCutoff.getUTCDate() - DEAD_SKU_LOOKBACK_DAYS);

    const { data: recentOrders, error: recentOrdersErr } = await supabase
      .from('orders')
      .select('id')
      .gte('created_at', deadCutoff.toISOString())
      .in('status', COMMITTED_STATUSES);
    if (recentOrdersErr) throw recentOrdersErr;
    const recentOrderIds = (recentOrders ?? []).map((o) => o.id);

    const recentlySoldProductIds = new Set<number>();
    if (recentOrderIds.length > 0) {
      const { data: recentItems, error: recentItemsErr } = await supabase
        .from('order_items')
        .select('product_id')
        .in('order_id', recentOrderIds);
      if (recentItemsErr) throw recentItemsErr;
      for (const it of recentItems ?? []) {
        if (it.product_id != null) recentlySoldProductIds.add(it.product_id);
      }
    }

    const { data: enabledProducts, error: enabledErr } = await supabase
      .from('Products')
      .select('id, sku, item_name, category_id, created_at')
      .eq('enable', true);
    if (enabledErr) throw enabledErr;

    const deadSkus = (enabledProducts ?? [])
      .filter((p: any) => !recentlySoldProductIds.has(p.id))
      .map((p: any) => ({
        productId: p.id,
        sku: p.sku,
        name: p.item_name,
        category: p.category_id ? categoryById.get(p.category_id) ?? null : null,
        createdAt: p.created_at,
      }));

    // ---- 9. New SKUs (created in last 90d) + adoption% within the period ----
    const newCutoff = new Date();
    newCutoff.setUTCDate(newCutoff.getUTCDate() - NEW_SKU_LOOKBACK_DAYS);

    const newProducts = (enabledProducts ?? [])
      .filter((p: any) => p.created_at && new Date(p.created_at) >= newCutoff)
      .map((p: any) => {
        const agg = productAgg.get(p.id);
        const buyers = agg?.buyerIds.size ?? 0;
        const adoptionPct =
          totalActivePartners > 0 ? (buyers / totalActivePartners) * 100 : 0;
        return {
          productId: p.id,
          sku: p.sku,
          name: p.item_name,
          category: p.category_id ? categoryById.get(p.category_id) ?? null : null,
          createdAt: p.created_at,
          buyers,
          adoptionPct,
          revenue: agg?.revenue ?? 0,
        };
      })
      .sort(
        (a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    // ---- 10. Heatmap: subsidiary × category revenue ----
    const { data: subsidiaries, error: subsErr } = await supabase
      .from('subsidiaries')
      .select('id, name')
      .order('name');
    if (subsErr) throw subsErr;

    // Aggregate per (subsidiary, category) by walking items × order.company → subsidiary
    const heatmapAgg = new Map<string, number>(); // key = `${subId}|${catId}`
    for (const it of items ?? []) {
      if (it.product_id == null) continue;
      const orderCo = orderCompany.get(it.order_id);
      if (!orderCo) continue;
      const subId = companyById.get(orderCo)?.subsidiaryId ?? null;
      const meta = productMetaById.get(it.product_id);
      const catId = meta?.category_id ?? '__uncategorized__';
      if (!subId) continue; // skip companies with no subsidiary
      const key = `${subId}|${catId}`;
      heatmapAgg.set(key, (heatmapAgg.get(key) ?? 0) + (Number(it.total_price) || 0));
    }

    const heatmap = {
      subsidiaries: (subsidiaries ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
      })),
      categories: categoryMix.map((c) => ({ id: c.categoryId, name: c.name })),
      cells: Array.from(heatmapAgg.entries()).map(([key, revenue]) => {
        const [subsidiaryId, categoryId] = key.split('|');
        return { subsidiaryId, categoryId, revenue };
      }),
    };

    return NextResponse.json({
      period: { window, from: from.toISOString(), to: to.toISOString() },
      kpis: {
        activeSkus,
        units: totalUnits,
        revenue: totalRevenue,
        deadSkus: deadSkus.length,
        activePartners: totalActivePartners,
      },
      topProducts,
      categoryMix,
      products,
      heatmap,
      newProducts,
      deadSkus,
    });
  } catch (err: any) {
    const msg = err?.message ?? 'Unknown error';
    const status =
      msg === 'Not authenticated' || msg === 'Forbidden' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

function emptyPayload() {
  return {
    period: null,
    kpis: { activeSkus: 0, units: 0, revenue: 0, deadSkus: 0, activePartners: 0 },
    topProducts: [],
    categoryMix: [],
    products: [],
    heatmap: { subsidiaries: [], categories: [], cells: [] },
    newProducts: [],
    deadSkus: [],
  };
}
