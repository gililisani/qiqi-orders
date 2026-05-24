'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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
import PeriodSelector from '../_components/PeriodSelector';
import KpiCard from '../_components/KpiCard';

interface Payload {
  period: { window: string; from: string; to: string } | null;
  kpis: {
    earned: number;
    used: number;
    redemptionPct: number;
    balance: number;
    leftoverTotal: number;
    topUpTotal: number;
    partnersActive: number;
    ordersCount: number;
  };
  trend: Array<{ month: string; label: string; earned: number; used: number }>;
  topEarners: Array<{
    companyId: string;
    name: string;
    tierPercent: number | null;
    earned: number;
    used: number;
    balance: number;
    leftover: number;
    topUp: number;
    orders: number;
  }>;
  topUsers: Array<{
    companyId: string;
    name: string;
    tierPercent: number | null;
    earned: number;
    used: number;
    balance: number;
    orders: number;
  }>;
  topToppers: Array<{
    companyId: string;
    name: string;
    tierPercent: number | null;
    topUp: number;
    toppedUpOrders: number;
    orders: number;
  }>;
  topProducts: Array<{
    productId: number;
    sku: string | null;
    name: string | null;
    units: number;
    claimed: number;
    orders: number;
    partners: number;
  }>;
  behavior: {
    sampleSize: number;
    fullyRedeemedPct: number;
    underRedeemedPct: number;
    toppedUpPct: number;
    avgLeftover: number;
    avgTopUp: number;
  };
  tierDistribution: Array<{ percent: number; count: number }>;
  enrolledCount: number;
  notEnrolledCount: number;
  filterOptions: {
    companies: Array<{
      id: string;
      name: string;
      subsidiaryId: string | null;
      isEnrolled: boolean;
    }>;
    subsidiaries: Array<{ id: string; name: string }>;
  };
}

const TIER_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function SupportFundsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const window = sp.get('window') ?? '90d';
  const companyId = sp.get('companyId') ?? '';
  const subsidiaryId = sp.get('subsidiaryId') ?? '';

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'earners' | 'users' | 'toppers'>('earners');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams();
    qs.set('window', window);
    if (window === 'custom') {
      const f = sp.get('from');
      const t = sp.get('to');
      if (f) qs.set('from', f);
      if (t) qs.set('to', t);
    }
    if (companyId) qs.set('companyId', companyId);
    if (subsidiaryId) qs.set('subsidiaryId', subsidiaryId);

    fetchWithAuth(`/api/reports/support-funds?${qs.toString()}`)
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
  }, [window, companyId, subsidiaryId, sp]);

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/admin/reports/support-funds?${params.toString()}`);
  };

  const filteredCompanyOptions = useMemo(() => {
    if (!data) return [];
    if (!subsidiaryId) return data.filterOptions.companies;
    return data.filterOptions.companies.filter(
      (c) => c.subsidiaryId === subsidiaryId,
    );
  }, [data, subsidiaryId]);

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Support Funds"
        description="Credit earned, used, leftover and top-up behavior across partners."
        breadcrumbs={
          <Link
            href="/admin/reports"
            className="text-muted-foreground hover:text-foreground"
          >
            ← Reports
          </Link>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={subsidiaryId}
              onChange={(e) => {
                const v = e.target.value || null;
                const params = new URLSearchParams(sp.toString());
                if (v) params.set('subsidiaryId', v);
                else params.delete('subsidiaryId');
                if (companyId && data) {
                  const co = data.filterOptions.companies.find(
                    (c) => c.id === companyId,
                  );
                  if (v && co?.subsidiaryId !== v) params.delete('companyId');
                }
                router.push(
                  `/admin/reports/support-funds?${params.toString()}`,
                );
              }}
              className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground min-w-[140px]"
              aria-label="Subsidiary filter"
            >
              <option value="">All subsidiaries</option>
              {data?.filterOptions.subsidiaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={companyId}
              onChange={(e) => updateParam('companyId', e.target.value || null)}
              className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground min-w-[180px]"
              aria-label="Company filter"
            >
              <option value="">All companies</option>
              {filteredCompanyOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {!c.isEnrolled ? ' — not enrolled' : ''}
                </option>
              ))}
            </select>
            <PeriodSelector
              current={window}
              basePath="/admin/reports/support-funds"
            />
          </div>
        }
      />

      {error && (
        <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && data.notEnrolledCount > 0 && (
        <div className="mb-6 text-xs text-muted-foreground">
          {data.notEnrolledCount} of {data.enrolledCount + data.notEnrolledCount}{' '}
          partner{data.notEnrolledCount === 1 ? '' : 's'} are not enrolled in a
          support-fund tier and are excluded from every aggregate below.
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          label="Credit Earned"
          value={loading ? '—' : formatCurrency(data?.kpis.earned ?? 0)}
          deltaPct={null}
          hint={loading ? '' : `${formatNumber(data?.kpis.ordersCount ?? 0)} orders`}
        />
        <KpiCard
          label="Credit Used"
          value={loading ? '—' : formatCurrency(data?.kpis.used ?? 0)}
          deltaPct={null}
          hint="claimed via SF items"
        />
        <KpiCard
          label="Redemption"
          value={
            loading
              ? '—'
              : data && data.kpis.earned > 0
                ? `${data.kpis.redemptionPct.toFixed(0)}%`
                : '—'
          }
          deltaPct={null}
          hint={loading ? '' : `${formatNumber(data?.kpis.partnersActive ?? 0)} active partners`}
        />
        <BalanceKpi
          loading={loading}
          leftover={data?.kpis.leftoverTotal ?? 0}
          topUp={data?.kpis.topUpTotal ?? 0}
        />
      </div>

      {/* Trend */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle>Earned vs Used — monthly</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : (data?.trend.length ?? 0) === 0 ? (
            <EmptyHint>No SF activity in this period.</EmptyHint>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data!.trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                    }
                  />
                  <Tooltip
                    formatter={
                      ((v: number, n: string) => [formatCurrency(v), n]) as any
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="earned"
                    name="Earned"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="used"
                    name="Used"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top partners + Top products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Top partners</CardTitle>
            <div className="inline-flex rounded-md border border-border bg-card p-0.5">
              {[
                { key: 'earners' as const, label: 'By earned' },
                { key: 'users' as const, label: 'By used' },
                { key: 'toppers' as const, label: 'By top-up' },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded transition-colors',
                    tab === t.key
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <ListSkeleton />
            ) : tab === 'earners' ? (
              <PartnersTable kind="earners" rows={data?.topEarners ?? []} />
            ) : tab === 'users' ? (
              <PartnersTable kind="users" rows={data?.topUsers ?? []} />
            ) : (
              <PartnersTable kind="toppers" rows={data?.topToppers ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Top redeemed products</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <ListSkeleton />
            ) : (data?.topProducts.length ?? 0) === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No SF products redeemed.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Partners</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.topProducts.map((p) => (
                    <TableRow key={p.productId}>
                      <TableCell>
                        <Link
                          href={`/admin/products/${p.productId}`}
                          className="text-sm text-foreground hover:underline"
                        >
                          {p.name ?? p.sku ?? `#${p.productId}`}
                        </Link>
                        {p.sku && (
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {p.sku}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatNumber(p.units)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatCurrency(p.claimed)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatNumber(p.partners)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Behavior + Tiers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Redemption behavior</CardTitle>
          </CardHeader>
          <CardContent>
            <BehaviorBlock loading={loading} data={data?.behavior} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Tier distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-56 w-full" />
            ) : (data?.tierDistribution.length ?? 0) === 0 ? (
              <EmptyHint>No enrolled partners.</EmptyHint>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data!.tierDistribution.map((t) => ({
                      label: `${t.percent}%`,
                      count: t.count,
                    }))}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                    />
                    <Tooltip
                      formatter={
                        ((v: number) => [
                          `${formatNumber(v)} partner${v === 1 ? '' : 's'}`,
                          'Enrolled',
                        ]) as any
                      }
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {data!.tierDistribution.map((_, i) => (
                        <Cell
                          key={i}
                          fill={TIER_COLORS[i % TIER_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="p-6 space-y-2">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

function BalanceKpi({
  loading,
  leftover,
  topUp,
}: {
  loading: boolean;
  leftover: number;
  topUp: number;
}) {
  const net = leftover - topUp;
  const Icon = net > 0 ? '↑' : net < 0 ? '↓' : '—';
  const valueColor =
    net > 0 ? 'text-emerald-700' : net < 0 ? 'text-rose-700' : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-4 pt-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          Net Balance
        </p>
        <p
          className={cn(
            'mt-1 text-2xl font-semibold tabular-nums',
            valueColor,
          )}
        >
          {loading
            ? '—'
            : net === 0
              ? '$0'
              : `${net > 0 ? '+' : '-'}${formatCurrency(Math.abs(net))}`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {loading ? '' : (
            <>
              <span className="text-emerald-700">{formatCurrency(leftover)} unused</span>
              {' · '}
              <span className="text-rose-700">{formatCurrency(topUp)} top-up</span>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function PartnersTable({
  kind,
  rows,
}: {
  kind: 'earners' | 'users' | 'toppers';
  rows: any[];
}) {
  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No data.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Partner</TableHead>
          <TableHead className="text-right">Tier</TableHead>
          {kind === 'earners' && (
            <>
              <TableHead className="text-right">Earned</TableHead>
              <TableHead className="text-right">Used</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </>
          )}
          {kind === 'users' && (
            <>
              <TableHead className="text-right">Used</TableHead>
              <TableHead className="text-right">Earned</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </>
          )}
          {kind === 'toppers' && (
            <>
              <TableHead className="text-right">Top-up $</TableHead>
              <TableHead className="text-right">Orders</TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.companyId}>
            <TableCell>
              <Link
                href={`/admin/companies/${r.companyId}`}
                className="text-sm font-medium text-foreground hover:underline"
              >
                {r.name}
              </Link>
            </TableCell>
            <TableCell className="text-right text-xs font-mono text-muted-foreground tabular-nums">
              {r.tierPercent != null ? `${r.tierPercent}%` : '—'}
            </TableCell>
            {kind === 'earners' && (
              <>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {formatCurrency(r.earned)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {formatCurrency(r.used)}
                </TableCell>
                <TableCell className="text-right">
                  <BalancePill value={r.balance} />
                </TableCell>
              </>
            )}
            {kind === 'users' && (
              <>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {formatCurrency(r.used)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {formatCurrency(r.earned)}
                </TableCell>
                <TableCell className="text-right">
                  <BalancePill value={r.balance} />
                </TableCell>
              </>
            )}
            {kind === 'toppers' && (
              <>
                <TableCell className="text-right font-mono text-sm tabular-nums text-rose-700">
                  {formatCurrency(r.topUp)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {r.toppedUpOrders} / {r.orders}
                </TableCell>
              </>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BalancePill({ value }: { value: number }) {
  if (Math.abs(value) < 0.01) {
    return <span className="text-xs text-muted-foreground">Even</span>;
  }
  if (value > 0) {
    return (
      <span className="inline-flex items-center rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 font-mono">
        +{formatCurrency(value)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-sm border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 font-mono">
      -{formatCurrency(-value)}
    </span>
  );
}

function BehaviorBlock({
  loading,
  data,
}: {
  loading: boolean;
  data?: Payload['behavior'];
}) {
  if (loading || !data) return <Skeleton className="h-32 w-full" />;
  if (data.sampleSize === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No SF activity in this period.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Distribution across {data.sampleSize} order
        {data.sampleSize === 1 ? '' : 's'}
      </p>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="bg-emerald-500"
          style={{ width: `${data.fullyRedeemedPct}%` }}
        />
        <div
          className="bg-amber-400"
          style={{ width: `${data.underRedeemedPct}%` }}
        />
        <div
          className="bg-rose-500"
          style={{ width: `${data.toppedUpPct}%` }}
        />
      </div>
      <div className="space-y-1.5 text-sm">
        <LegendRow color="bg-emerald-500" label="Fully redeemed" pct={data.fullyRedeemedPct} />
        <LegendRow color="bg-amber-400" label="Under-redeemed (balance left)" pct={data.underRedeemedPct} />
        <LegendRow color="bg-rose-500" label="Topped up (extra paid in)" pct={data.toppedUpPct} />
      </div>
      <div className="grid grid-cols-2 gap-3 pt-2">
        <div className="rounded-md border border-border bg-secondary/30 p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
            Avg leftover
          </p>
          <p className="mt-0.5 text-base font-semibold text-emerald-700 tabular-nums">
            {formatCurrency(data.avgLeftover)}
          </p>
        </div>
        <div className="rounded-md border border-border bg-secondary/30 p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
            Avg top-up
          </p>
          <p className="mt-0.5 text-base font-semibold text-rose-700 tabular-nums">
            {formatCurrency(data.avgTopUp)}
          </p>
        </div>
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  pct,
}: {
  color: string;
  label: string;
  pct: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      <span className="text-sm text-foreground flex-1">{label}</span>
      <span className="text-sm font-mono tabular-nums text-muted-foreground">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}
