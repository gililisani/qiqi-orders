import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdmin,
} from '../../../../platform/auth/guards';

/**
 * GET /api/reports/sales-explorer
 *   ?row=<dim>&col=<dim|none>&metric=revenue|units|orders
 *   &window=30d|90d|ytd|custom[&from=&to=]
 *   &companyId=<uuid>&subsidiaryId=<uuid>&status=Open,Done,...
 *
 * Pivot endpoint for the Sales Explorer. Returns one cell per
 * (rowKey, colKey) pair, plus rowTotals, colTotals, grandTotal,
 * and the ordered row / column label arrays so the page can render
 * the table without further lookups.
 *
 * Aggregates at order_items level. "Orders" metric uses
 * COUNT(DISTINCT order_id) per bucket; revenue/units are simple sums.
 *
 * Default status filter is the committed set (Open / In Process /
 * Ready / Done). Pass status=all to include drafts + cancelled, or
 * a comma-separated list for an explicit set.
 */

type Dim =
  | 'company'
  | 'subsidiary'
  | 'class'
  | 'category'
  | 'product'
  | 'month'
  | 'quarter';
type DimOrNone = Dim | 'none';
type Metric = 'revenue' | 'units' | 'orders';
type WindowKey = '30d' | '90d' | 'ytd' | 'custom';

const COMMITTED_STATUSES = ['Open', 'In Process', 'Ready', 'Done'];

const DIM_LABELS: Record<Dim, string> = {
  company: 'Company',
  subsidiary: 'Subsidiary',
  class: 'Class',
  category: 'Category',
  product: 'Product',
  month: 'Month',
  quarter: 'Quarter',
};

function periodRange(window: WindowKey, fromParam: string | null, toParam: string | null) {
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
  const key = `${y}-${String(m + 1).padStart(2, '0')}`;
  const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return { key, label };
}

function quarterKey(d: Date): { key: string; label: string } {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return { key: `${y}-Q${q}`, label: `Q${q} ${y}` };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const sp = new URL(request.url).searchParams;

    const row = (sp.get('row') ?? 'company') as Dim;
    const col = (sp.get('col') ?? 'month') as DimOrNone;
    const metric = (sp.get('metric') ?? 'revenue') as Metric;
    const window = (sp.get('window') ?? '90d') as WindowKey;
    const fromParam = sp.get('from');
    const toParam = sp.get('to');
    const companyIdFilter = sp.get('companyId') || null;
    const subsidiaryIdFilter = sp.get('subsidiaryId') || null;
    const statusParam = sp.get('status');

    if (!Object.keys(DIM_LABELS).includes(row)) {
      return NextResponse.json({ error: `invalid row dim: ${row}` }, { status: 400 });
    }
    if (col !== 'none' && !Object.keys(DIM_LABELS).includes(col)) {
      return NextResponse.json({ error: `invalid col dim: ${col}` }, { status: 400 });
    }

    const statuses =
      statusParam === 'all'
        ? null
        : statusParam
          ? statusParam.split(',').filter(Boolean)
          : COMMITTED_STATUSES;

    const { from, to } = periodRange(window, fromParam, toParam);
    const supabase = createServiceRoleClient();

    // 1. Orders in window (with company info for filter + dim joins)
    let ordersQuery = supabase
      .from('orders')
      .select(
        'id, company_id, created_at, status, total_value, company:companies(id, company_name, subsidiary_id, class_id)',
      )
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString());
    if (statuses) ordersQuery = ordersQuery.in('status', statuses);
    if (companyIdFilter) ordersQuery = ordersQuery.eq('company_id', companyIdFilter);

    const { data: ordersRaw, error: ordersErr } = await ordersQuery;
    if (ordersErr) throw ordersErr;

    // Subsidiary filter applied in JS (composite filter via PostgREST is painful).
    let orders = (ordersRaw ?? []).map((o: any) => ({
      id: o.id as string,
      company_id: o.company_id as string | null,
      created_at: o.created_at as string,
      status: o.status as string,
      total_value: Number(o.total_value) || 0,
      company: Array.isArray(o.company) ? o.company[0] : o.company,
    }));
    if (subsidiaryIdFilter) {
      orders = orders.filter((o) => o.company?.subsidiary_id === subsidiaryIdFilter);
    }
    if (orders.length === 0) {
      return NextResponse.json(emptyPayload(row, col, metric, from, to));
    }

    // 2. Items for those orders
    const orderIds = orders.map((o) => o.id);
    const { data: itemsRaw, error: itemsErr } = await supabase
      .from('order_items')
      .select('order_id, product_id, quantity, total_price')
      .in('order_id', orderIds);
    if (itemsErr) throw itemsErr;
    const items = itemsRaw ?? [];

    // 3. Lookup tables for labels (only what we'll need based on dims)
    const needsCompany = row === 'company' || col === 'company';
    const needsSubsidiary = row === 'subsidiary' || col === 'subsidiary';
    const needsClass = row === 'class' || col === 'class';
    const needsProduct = row === 'product' || col === 'product';
    const needsCategory = row === 'category' || col === 'category';

    const productIds = new Set<number>();
    if (needsProduct || needsCategory) {
      for (const it of items) if (it.product_id != null) productIds.add(it.product_id);
    }

    const [companyRes, subsRes, classRes, prodRes, catRes] = await Promise.all([
      needsCompany
        ? supabase
            .from('companies')
            .select('id, company_name')
            .in(
              'id',
              Array.from(new Set(orders.map((o) => o.company_id).filter(Boolean))) as string[],
            )
        : Promise.resolve({ data: [], error: null } as any),
      needsSubsidiary ? supabase.from('subsidiaries').select('id, name') : Promise.resolve({ data: [], error: null } as any),
      needsClass ? supabase.from('classes').select('id, name') : Promise.resolve({ data: [], error: null } as any),
      needsProduct || needsCategory
        ? productIds.size > 0
          ? supabase
              .from('Products')
              .select('id, sku, item_name, category_id')
              .in('id', Array.from(productIds))
          : Promise.resolve({ data: [], error: null } as any)
        : Promise.resolve({ data: [], error: null } as any),
      needsCategory ? supabase.from('categories').select('id, name') : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (companyRes.error) throw companyRes.error;
    if (subsRes.error) throw subsRes.error;
    if (classRes.error) throw classRes.error;
    if (prodRes.error) throw prodRes.error;
    if (catRes.error) throw catRes.error;

    const companyName = new Map<string, string>(
      (companyRes.data ?? []).map((c: any) => [c.id, c.company_name ?? 'Unknown']),
    );
    const subsName = new Map<string, string>(
      (subsRes.data ?? []).map((s: any) => [s.id, s.name ?? 'Unknown']),
    );
    const className = new Map<string, string>(
      (classRes.data ?? []).map((c: any) => [c.id, c.name ?? 'Unknown']),
    );
    const productInfo = new Map<number, { sku: string | null; name: string | null; categoryId: string | null }>(
      (prodRes.data ?? []).map((p: any) => [
        p.id,
        { sku: p.sku ?? null, name: p.item_name ?? null, categoryId: p.category_id ?? null },
      ]),
    );
    const categoryName = new Map<string, string>(
      (catRes.data ?? []).map((c: any) => [c.id, c.name ?? 'Unknown']),
    );

    // 4. Build pivot
    // Index orders by id for fast lookup during item iteration.
    const orderById = new Map<string, (typeof orders)[number]>();
    for (const o of orders) orderById.set(o.id, o);

    function dimValue(d: Dim, o: (typeof orders)[number], it: { product_id: number | null }): { key: string; label: string } | null {
      switch (d) {
        case 'company': {
          const id = o.company_id;
          if (!id) return { key: '__none__', label: 'Unknown' };
          return { key: id, label: companyName.get(id) ?? 'Unknown' };
        }
        case 'subsidiary': {
          const id = o.company?.subsidiary_id ?? null;
          if (!id) return { key: '__none__', label: 'Unassigned' };
          return { key: id, label: subsName.get(id) ?? 'Unknown' };
        }
        case 'class': {
          const id = o.company?.class_id ?? null;
          if (!id) return { key: '__none__', label: 'Unassigned' };
          return { key: id, label: className.get(id) ?? 'Unknown' };
        }
        case 'category': {
          const pid = it.product_id;
          const cid = pid != null ? productInfo.get(pid)?.categoryId ?? null : null;
          if (!cid) return { key: '__none__', label: 'Uncategorized' };
          return { key: cid, label: categoryName.get(cid) ?? 'Unknown' };
        }
        case 'product': {
          const pid = it.product_id;
          if (pid == null) return { key: '__none__', label: 'Unknown' };
          const info = productInfo.get(pid);
          return {
            key: String(pid),
            label: info?.sku ? info.sku : info?.name ?? `#${pid}`,
          };
        }
        case 'month': {
          return monthKey(new Date(o.created_at));
        }
        case 'quarter': {
          return quarterKey(new Date(o.created_at));
        }
      }
    }

    // Cell accumulator: rowKey → colKey → { value, orderIds (for distinct count) }
    interface Cell {
      revenue: number;
      units: number;
      orderIds: Set<string>;
    }
    const cells = new Map<string, Map<string, Cell>>();
    const rowLabels = new Map<string, string>();
    const colLabels = new Map<string, string>();
    const COL_ALL = '__all__';
    const COL_ALL_LABEL = 'Total';

    // We iterate items so dims like product/category work; for order-level
    // dims (company/sub/class/month/quarter), the value would otherwise
    // multiply by item count. We avoid that by:
    //   - revenue/units come from item rows (correct)
    //   - orderIds collected as a set per cell (distinct → no inflation)
    // i.e., the metric layer is item-aware: orders metric never inflates.
    for (const it of items) {
      const o = orderById.get(it.order_id);
      if (!o) continue;

      const rowK = dimValue(row, o, it);
      if (!rowK) continue;
      const colK: { key: string; label: string } =
        col === 'none'
          ? { key: COL_ALL, label: COL_ALL_LABEL }
          : (dimValue(col, o, it) ?? { key: '__none__', label: '—' });

      rowLabels.set(rowK.key, rowK.label);
      colLabels.set(colK.key, colK.label);

      let rowMap = cells.get(rowK.key);
      if (!rowMap) {
        rowMap = new Map<string, Cell>();
        cells.set(rowK.key, rowMap);
      }
      let cell = rowMap.get(colK.key);
      if (!cell) {
        cell = { revenue: 0, units: 0, orderIds: new Set<string>() };
        rowMap.set(colK.key, cell);
      }
      cell.revenue += Number(it.total_price) || 0;
      cell.units += Number(it.quantity) || 0;
      cell.orderIds.add(o.id);
    }

    // 5. Materialize cells with the chosen metric value
    function metricValue(c: Cell): number {
      switch (metric) {
        case 'revenue':
          return c.revenue;
        case 'units':
          return c.units;
        case 'orders':
          return c.orderIds.size;
      }
    }

    const rowKeys = Array.from(rowLabels.keys());
    const colKeys = Array.from(colLabels.keys());

    // Sort columns: months/quarters chronological by key (lexicographic works
    // for both formats), others alphabetical by label.
    if (col === 'month' || col === 'quarter') {
      colKeys.sort();
    } else {
      colKeys.sort((a, b) =>
        (colLabels.get(a) ?? '').localeCompare(colLabels.get(b) ?? ''),
      );
    }

    // Row totals + sort rows by total desc (most useful default).
    const rowTotals = new Map<string, number>();
    for (const rk of rowKeys) {
      let total = 0;
      const rowMap = cells.get(rk);
      if (rowMap) {
        for (const c of rowMap.values()) total += metricValue(c);
      }
      rowTotals.set(rk, total);
    }
    rowKeys.sort((a, b) => (rowTotals.get(b) ?? 0) - (rowTotals.get(a) ?? 0));

    const colTotals = new Map<string, number>();
    for (const ck of colKeys) {
      let total = 0;
      for (const rk of rowKeys) {
        const c = cells.get(rk)?.get(ck);
        if (c) total += metricValue(c);
      }
      colTotals.set(ck, total);
    }
    let grandTotal = 0;
    for (const v of rowTotals.values()) grandTotal += v;

    const pivot = rowKeys.map((rk) => ({
      rowKey: rk,
      rowLabel: rowLabels.get(rk) ?? rk,
      cells: colKeys.map((ck) => {
        const c = cells.get(rk)?.get(ck);
        return c ? metricValue(c) : 0;
      }),
      rowTotal: rowTotals.get(rk) ?? 0,
    }));

    // 6. Filter options for the page (always derive from full data set, not the
    //    filtered query, so the dropdowns are stable as filters change).
    const filterOptions = await loadFilterOptions(supabase);

    return NextResponse.json({
      period: { window, from: from.toISOString(), to: to.toISOString() },
      dims: { row, col, metric },
      columns: colKeys.map((k) => ({ key: k, label: colLabels.get(k) ?? k })),
      rows: pivot,
      colTotals: colKeys.map((k) => colTotals.get(k) ?? 0),
      grandTotal,
      filterOptions,
    });
  } catch (err: any) {
    const msg = err?.message ?? 'Unknown error';
    const status =
      msg === 'Not authenticated' || msg === 'Forbidden' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

async function loadFilterOptions(supabase: any) {
  const [companiesRes, subsidiariesRes] = await Promise.all([
    supabase
      .from('companies')
      .select('id, company_name, subsidiary_id')
      .order('company_name'),
    supabase.from('subsidiaries').select('id, name').order('name'),
  ]);
  return {
    companies: (companiesRes.data ?? []).map((c: any) => ({
      id: c.id,
      name: c.company_name,
      subsidiaryId: c.subsidiary_id ?? null,
    })),
    subsidiaries: (subsidiariesRes.data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
    })),
  };
}

function emptyPayload(row: Dim, col: DimOrNone, metric: Metric, from: Date, to: Date) {
  return {
    period: { window: 'custom', from: from.toISOString(), to: to.toISOString() },
    dims: { row, col, metric },
    columns: [],
    rows: [],
    colTotals: [],
    grandTotal: 0,
    filterOptions: { companies: [], subsidiaries: [] },
  };
}
