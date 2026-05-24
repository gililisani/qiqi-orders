'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Search, Sparkles } from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { formatCurrency, formatNumber } from '../../../../lib/formatters';
import { cn } from '../../../../lib/utils';
import { PageHeader } from '../../../components/qq/page-header';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/qq/card';
import { Skeleton } from '../../../components/qq/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/qq/table';
import { Input } from '../../../components/qq/input';

type WindowKey = '30d' | '90d' | 'ytd';

interface ProductRow {
  productId: number;
  sku: string | null;
  name: string | null;
  category: string | null;
  categoryId: string | null;
  units: number;
  revenue: number;
  orders: number;
  buyers: number;
  topBuyer: string | null;
}

interface Payload {
  kpis: {
    activeSkus: number;
    units: number;
    revenue: number;
    deadSkus: number;
    activePartners: number;
  };
  topProducts: Array<{
    productId: number;
    sku: string | null;
    name: string | null;
    units: number;
    revenue: number;
  }>;
  categoryMix: Array<{
    categoryId: string;
    name: string;
    revenue: number;
    units: number;
  }>;
  products: ProductRow[];
  heatmap: {
    subsidiaries: Array<{ id: string; name: string }>;
    categories: Array<{ id: string; name: string }>;
    cells: Array<{ subsidiaryId: string; categoryId: string; revenue: number }>;
  };
  newProducts: Array<{
    productId: number;
    sku: string | null;
    name: string | null;
    category: string | null;
    createdAt: string;
    buyers: number;
    adoptionPct: number;
    revenue: number;
  }>;
  deadSkus: Array<{
    productId: number;
    sku: string | null;
    name: string | null;
    category: string | null;
    createdAt: string | null;
  }>;
}

type SortKey =
  | 'sku'
  | 'name'
  | 'category'
  | 'units'
  | 'revenue'
  | 'orders'
  | 'buyers';

const PRESETS: Array<{ key: WindowKey; label: string }> = [
  { key: '30d', label: 'Last 30d' },
  { key: '90d', label: 'Last 90d' },
  { key: 'ytd', label: 'YTD' },
];

const CATEGORY_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#ec4899',
  '#f97316',
  '#64748b',
];

export default function ProductInsightsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const window = (sp.get('window') as WindowKey) ?? '90d';

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [activityTab, setActivityTab] = useState<'new' | 'dead'>('new');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchWithAuth(`/api/reports/product-insights?window=${window}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load');
        return json as Payload;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [window]);

  const setWindow = (w: WindowKey) => {
    const params = new URLSearchParams(sp.toString());
    params.set('window', w);
    router.push(`/admin/reports/product-insights?${params.toString()}`);
  };

  const filteredSortedProducts = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    const filtered = data.products.filter((p) => {
      if (categoryFilter !== 'all' && p.categoryId !== categoryFilter) return false;
      if (!term) return true;
      return (
        p.sku?.toLowerCase().includes(term) ||
        p.name?.toLowerCase().includes(term)
      );
    });
    filtered.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp = 0;
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = -1;
      else if (bv == null) cmp = 1;
      else if (typeof av === 'string' && typeof bv === 'string')
        cmp = av.localeCompare(bv);
      else cmp = (Number(av) || 0) - (Number(bv) || 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return filtered;
  }, [data, search, categoryFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir(key === 'sku' || key === 'name' || key === 'category' ? 'asc' : 'desc');
    }
  };

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Product Insights"
        description="What sells, who buys it, what's gone quiet."
        breadcrumbs={
          <Link
            href="/admin/reports"
            className="text-muted-foreground hover:text-foreground"
          >
            ← Reports
          </Link>
        }
        actions={
          <div className="inline-flex rounded-md border border-border bg-card p-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setWindow(p.key)}
                className={cn(
                  'px-3 py-1.5 text-sm rounded transition-colors',
                  window === p.key
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Kpi label="SKUs Sold" value={loading ? '—' : formatNumber(data?.kpis.activeSkus ?? 0)} hint="distinct products with sales" />
        <Kpi label="Units" value={loading ? '—' : formatNumber(data?.kpis.units ?? 0)} hint="total units shipped/booked" />
        <Kpi label="Revenue" value={loading ? '—' : formatCurrency(data?.kpis.revenue ?? 0)} hint="committed orders only" />
        <Kpi
          label="Dead SKUs"
          value={loading ? '—' : formatNumber(data?.kpis.deadSkus ?? 0)}
          hint="active products · 0 sales 90d"
          tone={data && data.kpis.deadSkus > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {/* Top products + category mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>Top 10 products by revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (data?.topProducts.length ?? 0) === 0 ? (
              <EmptyHint>No product sales in this period.</EmptyHint>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data!.topProducts.map((p) => ({
                      label: p.sku ?? p.name ?? `#${p.productId}`,
                      revenue: p.revenue,
                      name: p.name,
                    }))}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                  >
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#374151' }}
                      width={110}
                    />
                    <Tooltip
                      formatter={
                        ((v: number, _n: string, item: any) => [
                          formatCurrency(v),
                          item.payload.name ?? 'Revenue',
                        ]) as any
                      }
                      labelFormatter={((l: string) => l) as any}
                    />
                    <Bar dataKey="revenue" fill="#111827" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Category mix</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : (data?.categoryMix.length ?? 0) === 0 ? (
              <EmptyHint>No data.</EmptyHint>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data!.categoryMix.map((c) => ({
                        name: c.name,
                        value: c.revenue,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {data!.categoryMix.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={
                        ((v: number, n: string) => [formatCurrency(v), n]) as any
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Products table */}
      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2 gap-3 flex-wrap">
          <CardTitle>Products</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SKU or name…"
                className="pl-8 h-9 w-56"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
            >
              <option value="all">All categories</option>
              {data?.categoryMix.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : filteredSortedProducts.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No products match those filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="SKU" sortKey="sku" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHead label="Product" sortKey="name" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHead label="Category" sortKey="category" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHead label="Units" sortKey="units" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <SortableHead label="Revenue" sortKey="revenue" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <SortableHead label="Orders" sortKey="orders" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <SortableHead label="Buyers" sortKey="buyers" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <TableHead>Top Buyer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSortedProducts.map((p) => (
                  <TableRow key={p.productId}>
                    <TableCell className="font-mono text-xs">{p.sku ?? '—'}</TableCell>
                    <TableCell className="text-sm">
                      <Link
                        href={`/admin/products/${p.productId}`}
                        className="text-foreground hover:underline"
                      >
                        {p.name ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.category ?? 'Uncategorized'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatNumber(p.units)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCurrency(p.revenue)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatNumber(p.orders)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatNumber(p.buyers)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.topBuyer ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Heatmap + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Revenue by subsidiary × category</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Heatmap loading={loading} data={data?.heatmap} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>SKU activity</CardTitle>
            <div className="inline-flex rounded-md border border-border bg-card p-0.5">
              {[
                { key: 'new' as const, label: 'New', count: data?.newProducts.length ?? 0 },
                { key: 'dead' as const, label: 'Dead', count: data?.deadSkus.length ?? 0 },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActivityTab(t.key)}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded transition-colors',
                    activityTab === t.key
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                  )}
                >
                  {t.label} <span className="ml-1 tabular-nums">{formatNumber(t.count)}</span>
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : activityTab === 'new' ? (
              <NewSkuList items={data?.newProducts ?? []} />
            ) : (
              <DeadSkuList items={data?.deadSkus ?? []} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------

function Kpi({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'neutral' | 'warn';
}) {
  return (
    <Card>
      <CardContent className="p-4 pt-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p
          className={cn(
            'mt-1 text-2xl font-semibold tabular-nums',
            tone === 'warn' ? 'text-amber-700' : 'text-foreground',
          )}
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function SortableHead({
  label,
  sortKey,
  current,
  dir,
  onClick,
  align,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: 'asc' | 'desc';
  onClick: (k: SortKey) => void;
  align?: 'right';
}) {
  const active = current === sortKey;
  return (
    <TableHead className={align === 'right' ? 'text-right' : undefined}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
          align === 'right' ? 'ml-auto' : '',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        {active && (
          <span className="text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>
        )}
      </button>
    </TableHead>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Heatmap({
  loading,
  data,
}: {
  loading: boolean;
  data?: Payload['heatmap'];
}) {
  if (loading) {
    return (
      <div className="p-6 space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }
  if (!data || data.subsidiaries.length === 0 || data.categories.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No subsidiary × category data in this period.
      </div>
    );
  }

  const cellMap = new Map<string, number>();
  for (const c of data.cells) {
    cellMap.set(`${c.subsidiaryId}|${c.categoryId}`, c.revenue);
  }
  const max = Math.max(0, ...data.cells.map((c) => c.revenue));

  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left font-medium text-muted-foreground"></th>
            {data.categories.map((c) => (
              <th
                key={c.id}
                className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap"
              >
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.subsidiaries.map((s) => (
            <tr key={s.id}>
              <td className="px-2 py-1.5 text-foreground whitespace-nowrap pr-4">
                {s.name}
              </td>
              {data.categories.map((c) => {
                const v = cellMap.get(`${s.id}|${c.id}`) ?? 0;
                const intensity = max > 0 ? v / max : 0;
                const bg = `rgba(99, 102, 241, ${intensity.toFixed(3)})`;
                return (
                  <td
                    key={c.id}
                    className="px-2 py-1.5 text-right font-mono tabular-nums"
                    style={{
                      backgroundColor: v > 0 ? bg : undefined,
                      color: intensity > 0.55 ? '#fff' : undefined,
                    }}
                    title={`${s.name} · ${c.name}: ${formatCurrency(v)}`}
                  >
                    {v > 0 ? formatCompactCurrency(v) : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCompactCurrency(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function NewSkuList({ items }: { items: Payload['newProducts'] }) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No SKUs added in the last 90 days.
      </div>
    );
  }
  return (
    <div className="divide-y divide-border">
      {items.map((p) => (
        <div key={p.productId} className="px-4 py-3 flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-brand-periwinkle flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/products/${p.productId}`}
                className="text-sm font-medium text-foreground hover:underline truncate"
              >
                {p.name ?? p.sku ?? `#${p.productId}`}
              </Link>
              {p.sku && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {p.sku}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {p.category ?? 'Uncategorized'} · added{' '}
              {new Date(p.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium tabular-nums">
              {p.adoptionPct.toFixed(0)}%
            </div>
            <div className="text-[10px] text-muted-foreground">
              {p.buyers} buyer{p.buyers === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeadSkuList({ items }: { items: Payload['deadSkus'] }) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No dead SKUs — every active product sold in the last 90 days.
      </div>
    );
  }
  return (
    <div className="divide-y divide-border max-h-96 overflow-y-auto">
      {items.map((p) => (
        <div key={p.productId} className="px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/products/${p.productId}`}
                className="text-sm font-medium text-foreground hover:underline truncate"
              >
                {p.name ?? p.sku ?? `#${p.productId}`}
              </Link>
              {p.sku && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {p.sku}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {p.category ?? 'Uncategorized'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
