import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdmin,
} from '../../../../platform/auth/guards';

/**
 * GET /api/reports/support-funds
 *   ?window=30d|90d|ytd|custom[&from=&to=]
 *   &companyId=<uuid>
 *   &subsidiaryId=<uuid>
 *
 * Dedicated support-fund report. Period is filtered on the Done-date
 * (when the order transitioned to status=Done via order_history),
 * matching the Company Performance convention — SF is "consumed" at
 * Done, not at creation.
 *
 * Definitions (consistent with Company Performance):
 *   earned   = SUM(orders.credit_earned)
 *   used     = SUM(order_items.total_price WHERE is_support_fund_item)
 *              ← what the client actually claimed
 *   leftover = MAX(0, earned − used) per company
 *   topUp    = MAX(0, used − earned) per order, summed
 *   balance  = earned − used (signed; positive = leftover, negative = top-up)
 *
 * Companies with companies.support_fund_id = NULL are flagged
 * NOT enrolled and excluded from every aggregate. They're reported
 * as a separate count for visibility.
 */

type WindowKey = '30d' | '90d' | 'ytd' | 'custom';

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

function monthKey(d: Date): { key: string; label: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return {
    key: `${y}-${String(m + 1).padStart(2, '0')}`,
    label: d.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const sp = new URL(request.url).searchParams;
    const window = (sp.get('window') ?? '90d') as WindowKey;
    const fromParam = sp.get('from');
    const toParam = sp.get('to');
    const companyIdFilter = sp.get('companyId') || null;
    const subsidiaryIdFilter = sp.get('subsidiaryId') || null;

    const { from, to } = periodRange(window, fromParam, toParam);
    const supabase = createServiceRoleClient();

    // ---- 1. Company catalog (for enrollment + subsidiary + tier %) ----
    const { data: companiesRaw, error: companiesErr } = await supabase
      .from('companies')
      .select(
        'id, company_name, subsidiary_id, support_fund_id, support_fund:support_fund_levels(id, percent), subsidiary:subsidiaries(id, name)',
      );
    if (companiesErr) throw companiesErr;

    const companyMeta = new Map<
      string,
      {
        name: string;
        subsidiaryId: string | null;
        subsidiaryName: string | null;
        supportFundId: string | null;
        tierPercent: number | null;
        isEnrolled: boolean;
      }
    >();
    for (const c of (companiesRaw ?? []) as any[]) {
      const sub = Array.isArray(c.subsidiary) ? c.subsidiary[0] : c.subsidiary;
      const sf = Array.isArray(c.support_fund) ? c.support_fund[0] : c.support_fund;
      companyMeta.set(c.id, {
        name: c.company_name ?? 'Unknown',
        subsidiaryId: c.subsidiary_id ?? null,
        subsidiaryName: sub?.name ?? null,
        supportFundId: c.support_fund_id ?? null,
        tierPercent: sf?.percent != null ? Number(sf.percent) : null,
        isEnrolled: c.support_fund_id != null,
      });
    }

    // Companies that pass the (subsidiary + enrollment) filter and apply to
    // every aggregate. Company filter further narrows.
    const eligibleCompanyIds = new Set<string>();
    for (const [id, meta] of companyMeta) {
      if (!meta.isEnrolled) continue;
      if (subsidiaryIdFilter && meta.subsidiaryId !== subsidiaryIdFilter) continue;
      if (companyIdFilter && id !== companyIdFilter) continue;
      eligibleCompanyIds.add(id);
    }

    // Counts (for the "not enrolled" footnote regardless of filter).
    const notEnrolledCount = Array.from(companyMeta.values()).filter(
      (m) => !m.isEnrolled,
    ).length;
    const enrolledCount = Array.from(companyMeta.values()).filter(
      (m) => m.isEnrolled,
    ).length;

    // Filter options for the page.
    const filterOptions = {
      companies: Array.from(companyMeta.entries())
        .map(([id, m]) => ({
          id,
          name: m.name,
          subsidiaryId: m.subsidiaryId,
          isEnrolled: m.isEnrolled,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      subsidiaries: Array.from(
        new Map(
          Array.from(companyMeta.values())
            .filter((m) => m.subsidiaryId && m.subsidiaryName)
            .map((m) => [m.subsidiaryId!, { id: m.subsidiaryId!, name: m.subsidiaryName! }]),
        ).values(),
      ).sort((a, b) => a.name.localeCompare(b.name)),
    };

    if (eligibleCompanyIds.size === 0) {
      return NextResponse.json({
        ...emptyPayload(),
        enrolledCount,
        notEnrolledCount,
        filterOptions,
      });
    }

    // ---- 2. All Done orders for eligible companies (no period filter yet —
    //         filter by Done-date below using order_history). ----
    const eligibleIds = Array.from(eligibleCompanyIds);
    const { data: doneOrdersRaw, error: ordersErr } = await supabase
      .from('orders')
      .select('id, company_id, credit_earned, support_fund_used')
      .eq('status', 'Done')
      .in('company_id', eligibleIds);
    if (ordersErr) throw ordersErr;
    const doneOrders = (doneOrdersRaw ?? []) as any[];

    if (doneOrders.length === 0) {
      return NextResponse.json({
        ...emptyPayload(),
        enrolledCount,
        notEnrolledCount,
        filterOptions,
      });
    }

    // ---- 3. Done-date per order ----
    const orderIds = doneOrders.map((o) => o.id as string);
    const { data: history, error: histErr } = await supabase
      .from('order_history')
      .select('order_id, created_at')
      .in('order_id', orderIds)
      .eq('status_to', 'Done')
      .order('created_at', { ascending: true });
    if (histErr) throw histErr;

    const firstDone = new Map<string, Date>();
    for (const h of history ?? []) {
      if (!firstDone.has(h.order_id)) {
        firstDone.set(h.order_id, new Date(h.created_at));
      }
    }

    const inPeriodOrders = doneOrders.filter((o) => {
      const d = firstDone.get(o.id);
      return d != null && d >= from && d <= to;
    });

    if (inPeriodOrders.length === 0) {
      return NextResponse.json({
        ...emptyPayload(),
        enrolledCount,
        notEnrolledCount,
        filterOptions,
        tierDistribution: tierDistribution(companyMeta, eligibleCompanyIds),
      });
    }

    // ---- 4. SF line items for those orders ----
    const inPeriodOrderIds = inPeriodOrders.map((o) => o.id as string);
    const { data: sfItems, error: sfItemsErr } = await supabase
      .from('order_items')
      .select('order_id, product_id, quantity, total_price')
      .in('order_id', inPeriodOrderIds)
      .eq('is_support_fund_item', true);
    if (sfItemsErr) throw sfItemsErr;

    const claimedByOrder = new Map<string, number>();
    const sfItemsByOrder = new Map<
      string,
      Array<{ productId: number | null; quantity: number; price: number }>
    >();
    for (const it of sfItems ?? []) {
      const oid = it.order_id as string;
      const price = Number(it.total_price) || 0;
      claimedByOrder.set(oid, (claimedByOrder.get(oid) ?? 0) + price);
      const list = sfItemsByOrder.get(oid) ?? [];
      list.push({
        productId: it.product_id as number | null,
        quantity: Number(it.quantity) || 0,
        price,
      });
      sfItemsByOrder.set(oid, list);
    }

    // ---- 5. Per-company aggregates ----
    interface CompanyAgg {
      earned: number;
      used: number;
      leftover: number;
      topUp: number;
      orders: number;
      toppedUpOrders: number;
      underRedeemedOrders: number;
      fullyRedeemedOrders: number;
    }
    const companyAgg = new Map<string, CompanyAgg>();

    for (const o of inPeriodOrders) {
      const cid = o.company_id as string;
      const earned = Number(o.credit_earned) || 0;
      const used = claimedByOrder.get(o.id) ?? 0;
      const delta = earned - used;

      const a = companyAgg.get(cid) ?? {
        earned: 0,
        used: 0,
        leftover: 0,
        topUp: 0,
        orders: 0,
        toppedUpOrders: 0,
        underRedeemedOrders: 0,
        fullyRedeemedOrders: 0,
      };
      a.earned += earned;
      a.used += used;
      a.orders += 1;
      if (earned === 0 && used === 0) {
        // skip — no SF activity on this order
      } else if (Math.abs(delta) < 0.01) {
        a.fullyRedeemedOrders += 1;
      } else if (delta > 0) {
        a.underRedeemedOrders += 1;
        a.leftover += delta;
      } else {
        a.toppedUpOrders += 1;
        a.topUp += -delta;
      }
      companyAgg.set(cid, a);
    }

    // ---- 6. Top earners (10) ----
    const topEarners = Array.from(companyAgg.entries())
      .map(([id, a]) => ({
        companyId: id,
        name: companyMeta.get(id)?.name ?? 'Unknown',
        tierPercent: companyMeta.get(id)?.tierPercent ?? null,
        earned: a.earned,
        used: a.used,
        balance: a.earned - a.used,
        leftover: a.leftover,
        topUp: a.topUp,
        orders: a.orders,
      }))
      .sort((a, b) => b.earned - a.earned)
      .slice(0, 10);

    // Also expose top users (highest USED — most actively redeeming SF $)
    const topUsers = Array.from(companyAgg.entries())
      .map(([id, a]) => ({
        companyId: id,
        name: companyMeta.get(id)?.name ?? 'Unknown',
        tierPercent: companyMeta.get(id)?.tierPercent ?? null,
        earned: a.earned,
        used: a.used,
        balance: a.earned - a.used,
        orders: a.orders,
      }))
      .filter((c) => c.used > 0)
      .sort((a, b) => b.used - a.used)
      .slice(0, 10);

    // Top toppers (highest top-up totals)
    const topToppers = Array.from(companyAgg.entries())
      .map(([id, a]) => ({
        companyId: id,
        name: companyMeta.get(id)?.name ?? 'Unknown',
        tierPercent: companyMeta.get(id)?.tierPercent ?? null,
        topUp: a.topUp,
        toppedUpOrders: a.toppedUpOrders,
        orders: a.orders,
      }))
      .filter((c) => c.topUp > 0)
      .sort((a, b) => b.topUp - a.topUp)
      .slice(0, 10);

    // ---- 7. Top redeemed products ----
    interface ProductAgg {
      units: number;
      claimed: number;
      orderIds: Set<string>;
      partnerIds: Set<string>;
    }
    const productAgg = new Map<number, ProductAgg>();
    const productIds = new Set<number>();
    for (const o of inPeriodOrders) {
      const items = sfItemsByOrder.get(o.id) ?? [];
      for (const it of items) {
        if (it.productId == null) continue;
        productIds.add(it.productId);
        const p = productAgg.get(it.productId) ?? {
          units: 0,
          claimed: 0,
          orderIds: new Set<string>(),
          partnerIds: new Set<string>(),
        };
        p.units += it.quantity;
        p.claimed += it.price;
        p.orderIds.add(o.id);
        if (o.company_id) p.partnerIds.add(o.company_id);
        productAgg.set(it.productId, p);
      }
    }

    const { data: productMeta, error: productMetaErr } = productIds.size
      ? await supabase
          .from('Products')
          .select('id, sku, item_name, category_id')
          .in('id', Array.from(productIds))
      : ({ data: [], error: null } as any);
    if (productMetaErr) throw productMetaErr;
    const productById = new Map<
      number,
      { sku: string | null; name: string | null }
    >(
      (productMeta ?? []).map((p: any) => [
        p.id,
        { sku: p.sku ?? null, name: p.item_name ?? null },
      ]),
    );

    const topProducts = Array.from(productAgg.entries())
      .map(([pid, p]) => ({
        productId: pid,
        sku: productById.get(pid)?.sku ?? null,
        name: productById.get(pid)?.name ?? null,
        units: p.units,
        claimed: p.claimed,
        orders: p.orderIds.size,
        partners: p.partnerIds.size,
      }))
      .sort((a, b) => b.claimed - a.claimed)
      .slice(0, 10);

    // ---- 8. Monthly trend (earned vs used) ----
    const trendMap = new Map<string, { label: string; earned: number; used: number }>();
    for (const o of inPeriodOrders) {
      const d = firstDone.get(o.id);
      if (!d) continue;
      const { key, label } = monthKey(d);
      const entry = trendMap.get(key) ?? { label, earned: 0, used: 0 };
      entry.earned += Number(o.credit_earned) || 0;
      entry.used += claimedByOrder.get(o.id) ?? 0;
      trendMap.set(key, entry);
    }
    const trend = Array.from(trendMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => ({ month: k, ...v }));

    // ---- 9. Behavior distribution + KPIs ----
    let earnedTotal = 0;
    let usedTotal = 0;
    let leftoverTotal = 0;
    let topUpTotal = 0;
    let toppedUpOrdersTotal = 0;
    let underRedeemedTotal = 0;
    let fullyRedeemedTotal = 0;
    let activityOrders = 0;

    for (const a of companyAgg.values()) {
      earnedTotal += a.earned;
      usedTotal += a.used;
      leftoverTotal += a.leftover;
      topUpTotal += a.topUp;
      toppedUpOrdersTotal += a.toppedUpOrders;
      underRedeemedTotal += a.underRedeemedOrders;
      fullyRedeemedTotal += a.fullyRedeemedOrders;
      activityOrders +=
        a.toppedUpOrders + a.underRedeemedOrders + a.fullyRedeemedOrders;
    }

    const behavior = {
      sampleSize: activityOrders,
      fullyRedeemedPct:
        activityOrders > 0 ? (fullyRedeemedTotal / activityOrders) * 100 : 0,
      underRedeemedPct:
        activityOrders > 0 ? (underRedeemedTotal / activityOrders) * 100 : 0,
      toppedUpPct:
        activityOrders > 0 ? (toppedUpOrdersTotal / activityOrders) * 100 : 0,
      avgLeftover: underRedeemedTotal > 0 ? leftoverTotal / underRedeemedTotal : 0,
      avgTopUp: toppedUpOrdersTotal > 0 ? topUpTotal / toppedUpOrdersTotal : 0,
    };

    const kpis = {
      earned: earnedTotal,
      used: usedTotal,
      redemptionPct: earnedTotal > 0 ? (usedTotal / earnedTotal) * 100 : 0,
      balance: earnedTotal - usedTotal,
      leftoverTotal,
      topUpTotal,
      partnersActive: companyAgg.size,
      ordersCount: inPeriodOrders.length,
    };

    return NextResponse.json({
      period: { window, from: from.toISOString(), to: to.toISOString() },
      kpis,
      trend,
      topEarners,
      topUsers,
      topToppers,
      topProducts,
      behavior,
      tierDistribution: tierDistribution(companyMeta, eligibleCompanyIds),
      enrolledCount,
      notEnrolledCount,
      filterOptions,
    });
  } catch (err: any) {
    const msg = err?.message ?? 'Unknown error';
    const status =
      msg === 'Not authenticated' || msg === 'Forbidden' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

function tierDistribution(
  companyMeta: Map<string, { tierPercent: number | null }>,
  eligibleIds: Set<string>,
) {
  const counts = new Map<number, number>();
  for (const id of eligibleIds) {
    const meta = companyMeta.get(id);
    if (!meta || meta.tierPercent == null) continue;
    counts.set(meta.tierPercent, (counts.get(meta.tierPercent) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([percent, count]) => ({ percent, count }))
    .sort((a, b) => a.percent - b.percent);
}

function emptyPayload() {
  return {
    period: null,
    kpis: {
      earned: 0,
      used: 0,
      redemptionPct: 0,
      balance: 0,
      leftoverTotal: 0,
      topUpTotal: 0,
      partnersActive: 0,
      ordersCount: 0,
    },
    trend: [],
    topEarners: [],
    topUsers: [],
    topToppers: [],
    topProducts: [],
    behavior: {
      sampleSize: 0,
      fullyRedeemedPct: 0,
      underRedeemedPct: 0,
      toppedUpPct: 0,
      avgLeftover: 0,
      avgTopUp: 0,
    },
    tierDistribution: [],
  };
}
