'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { formatCurrency, formatNumber } from '../../../../lib/formatters';
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
import { cn } from '../../../../lib/utils';

type Status =
  | 'Not Started'
  | 'Ahead'
  | 'On Track'
  | 'Slipping'
  | 'Complete'
  | 'At Risk';

interface PeriodRow {
  periodId: string;
  companyId: string;
  companyName: string;
  netsuiteNumber: string | null;
  periodName: string;
  startDate: string;
  endDate: string;
  daysTotal: number;
  daysElapsed: number;
  daysRemaining: number;
  target: number;
  actual: number;
  progressPct: number;
  expectedPct: number;
  paceDeltaPct: number;
  status: Status;
  sfAllocated: number;
  sfUsed: number;
  sfBalance: number;
}

interface Kpis {
  onTrack: number;
  slipping: number;
  ahead: number;
  atRisk: number;
  complete: number;
  notStarted: number;
  totalTarget: number;
  totalActual: number;
  overallProgressPct: number;
  sfAllocated: number;
  sfUsed: number;
  sfRedemptionPct: number;
  toppingUpCount: number;
  avgTopUp: number;
}

interface SfBehavior {
  underRedeemedPct: number;
  fullyRedeemedPct: number;
  toppedUpPct: number;
  avgTopUp: number;
  avgLeftover: number;
  sampleSize: number;
}

interface Payload {
  rows: PeriodRow[];
  kpis: Kpis;
  sfBehavior: SfBehavior;
}

type Scope = 'active' | 'all';
type SortKey =
  | 'companyName'
  | 'periodName'
  | 'target'
  | 'actual'
  | 'progressPct'
  | 'paceDeltaPct'
  | 'sfAllocated'
  | 'sfUsed'
  | 'sfBalance';

export default function CompanyPerformancePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const scope = (sp.get('scope') as Scope) ?? 'active';

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('progressPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchWithAuth(`/api/reports/company-performance?scope=${scope}`)
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
  }, [scope]);

  const setScope = (s: Scope) => {
    const params = new URLSearchParams(sp.toString());
    params.set('scope', s);
    router.push(`/admin/reports/company-performance?${params.toString()}`);
  };

  const sortedRows = useMemo(() => {
    if (!data) return [];
    const copy = [...data.rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp = 0;
      if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv);
      } else {
        cmp = (Number(av) || 0) - (Number(bv) || 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(
        key === 'companyName' || key === 'periodName' ? 'asc' : 'desc',
      );
    }
  };

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Company Performance"
        description="Goal progress, pace and support-fund behavior per partner."
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
            {(['active', 'all'] as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={cn(
                  'px-3 py-1.5 text-sm rounded transition-colors',
                  scope === s
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                )}
              >
                {s === 'active' ? 'Active periods' : 'All periods'}
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

      {/* KPI overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatusKpi
          label="On Track"
          value={loading ? null : data?.kpis.onTrack ?? 0}
          subtext={loading ? '' : `${data?.kpis.ahead ?? 0} ahead`}
          tone="positive"
          Icon={TrendingUp}
        />
        <StatusKpi
          label="Slipping"
          value={loading ? null : data?.kpis.slipping ?? 0}
          subtext={loading ? '' : `${data?.kpis.atRisk ?? 0} at risk`}
          tone="negative"
          Icon={TrendingDown}
        />
        <ProgressKpi
          label="Target vs Actual"
          loading={loading}
          actual={data?.kpis.totalActual ?? 0}
          target={data?.kpis.totalTarget ?? 0}
          pct={data?.kpis.overallProgressPct ?? 0}
        />
        <SfRedemptionKpi
          loading={loading}
          allocated={data?.kpis.sfAllocated ?? 0}
          used={data?.kpis.sfUsed ?? 0}
          pct={data?.kpis.sfRedemptionPct ?? 0}
          toppingUpCount={data?.kpis.toppingUpCount ?? 0}
          avgTopUp={data?.kpis.avgTopUp ?? 0}
        />
      </div>

      {/* Companies table */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle>Partners</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : sortedRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No {scope === 'active' ? 'active' : ''} target periods found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Company"
                    sortKey="companyName"
                    current={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <SortableHead
                    label="Period"
                    sortKey="periodName"
                    current={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <SortableHead
                    label="Target"
                    sortKey="target"
                    current={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                    align="right"
                  />
                  <SortableHead
                    label="Actual"
                    sortKey="actual"
                    current={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                    align="right"
                  />
                  <SortableHead
                    label="Progress"
                    sortKey="progressPct"
                    current={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <SortableHead
                    label="Pace"
                    sortKey="paceDeltaPct"
                    current={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                    align="right"
                  />
                  <TableHead>Status</TableHead>
                  <SortableHead
                    label="SF Earned"
                    sortKey="sfAllocated"
                    current={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                    align="right"
                  />
                  <SortableHead
                    label="SF Used"
                    sortKey="sfUsed"
                    current={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                    align="right"
                  />
                  <SortableHead
                    label="Balance"
                    sortKey="sfBalance"
                    current={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((r) => (
                  <TableRow key={r.periodId}>
                    <TableCell>
                      <Link
                        href={`/admin/companies/${r.companyId}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {r.companyName}
                      </Link>
                      {r.netsuiteNumber && (
                        <div className="text-xs text-muted-foreground font-mono">
                          {r.netsuiteNumber}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{r.periodName}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(r.startDate)} → {formatDate(r.endDate)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCurrency(r.target)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCurrency(r.actual)}
                    </TableCell>
                    <TableCell className="min-w-[140px]">
                      <ProgressBar pct={r.progressPct} expectedPct={r.expectedPct} />
                    </TableCell>
                    <TableCell className="text-right">
                      <PaceCell deltaPct={r.paceDeltaPct} status={r.status} />
                    </TableCell>
                    <TableCell>
                      <StatusPill status={r.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCurrency(r.sfAllocated)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCurrency(r.sfUsed)}
                    </TableCell>
                    <TableCell>
                      <BalancePill balance={r.sfBalance} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Support fund behavior */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Support fund behavior</CardTitle>
        </CardHeader>
        <CardContent>
          <SfBehaviorBlock loading={loading} data={data?.sfBehavior} />
        </CardContent>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Small in-file components
// ----------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

function StatusKpi({
  label,
  value,
  subtext,
  tone,
  Icon,
}: {
  label: string;
  value: number | null;
  subtext: string;
  tone: 'positive' | 'negative' | 'neutral';
  Icon: any;
}) {
  const color =
    tone === 'positive'
      ? 'text-emerald-600 bg-emerald-50'
      : tone === 'negative'
        ? 'text-rose-600 bg-rose-50'
        : 'text-muted-foreground bg-secondary';
  return (
    <Card>
      <CardContent className="p-4 pt-4">
        <div className="flex items-start justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <span className={cn('rounded-md p-1.5', color)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        </div>
        <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">
          {value === null ? '—' : formatNumber(value)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
      </CardContent>
    </Card>
  );
}

function ProgressKpi({
  label,
  loading,
  actual,
  target,
  pct,
}: {
  label: string;
  loading: boolean;
  actual: number;
  target: number;
  pct: number;
}) {
  return (
    <Card>
      <CardContent className="p-4 pt-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">
          {loading ? '—' : `${pct.toFixed(0)}%`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {loading ? '' : `${formatCurrency(actual)} / ${formatCurrency(target)}`}
        </p>
      </CardContent>
    </Card>
  );
}

function SfRedemptionKpi({
  loading,
  allocated,
  used,
  pct,
  toppingUpCount,
  avgTopUp,
}: {
  loading: boolean;
  allocated: number;
  used: number;
  pct: number;
  toppingUpCount: number;
  avgTopUp: number;
}) {
  return (
    <Card>
      <CardContent className="p-4 pt-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          SF Redemption
        </p>
        <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">
          {loading ? '—' : `${pct.toFixed(0)}%`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {loading
            ? ''
            : `${formatCurrency(used)} / ${formatCurrency(allocated)}`}
        </p>
        {!loading && toppingUpCount > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {toppingUpCount} topping up · avg {formatCurrency(avgTopUp)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ProgressBar({
  pct,
  expectedPct,
}: {
  pct: number;
  expectedPct: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const expectedClamped = Math.max(0, Math.min(100, expectedPct));
  const onPace = pct >= expectedPct - 20;
  return (
    <div>
      <div className="relative h-2 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            onPace ? 'bg-emerald-500' : 'bg-rose-500',
          )}
          style={{ width: `${clamped}%` }}
        />
        {/* Expected pace marker */}
        <div
          className="absolute top-0 h-full w-px bg-foreground/40"
          style={{ left: `${expectedClamped}%` }}
          title={`Expected at this point: ${expectedPct.toFixed(0)}%`}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{pct.toFixed(0)}%</span>
        <span>exp {expectedPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function PaceCell({
  deltaPct,
  status,
}: {
  deltaPct: number;
  status: Status;
}) {
  if (status === 'Not Started' || status === 'Complete') {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  const direction =
    deltaPct > 1 ? 'up' : deltaPct < -1 ? 'down' : 'flat';
  const Icon =
    direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const color =
    direction === 'up'
      ? 'text-emerald-600'
      : direction === 'down'
        ? 'text-rose-600'
        : 'text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-sm tabular-nums', color)}>
      <Icon className="h-3 w-3" />
      {deltaPct > 0 ? '+' : ''}
      {deltaPct.toFixed(0)}%
    </span>
  );
}

const STATUS_STYLES: Record<Status, { className: string; Icon: any }> = {
  Ahead: { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: TrendingUp },
  'On Track': { className: 'bg-secondary text-muted-foreground border-border', Icon: CheckCircle2 },
  Slipping: { className: 'bg-amber-50 text-amber-700 border-amber-200', Icon: TrendingDown },
  'At Risk': { className: 'bg-rose-50 text-rose-700 border-rose-200', Icon: AlertTriangle },
  Complete: { className: 'bg-[#D1FAE5] text-[#065F46] border-[#A7F3D0]', Icon: CheckCircle2 },
  'Not Started': { className: 'bg-secondary text-muted-foreground border-border', Icon: Clock },
};

function StatusPill({ status }: { status: Status }) {
  const { className, Icon } = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function BalancePill({ balance }: { balance: number }) {
  if (Math.abs(balance) < 0.01) {
    return (
      <span className="text-xs text-muted-foreground">Even</span>
    );
  }
  if (balance > 0) {
    return (
      <span className="inline-flex items-center rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 font-mono">
        +{formatCurrency(balance)} left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-sm border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 font-mono">
      -{formatCurrency(-balance)} top-up
    </span>
  );
}

function SfBehaviorBlock({
  loading,
  data,
}: {
  loading: boolean;
  data?: SfBehavior;
}) {
  if (loading || !data) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (data.sampleSize === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No Done orders with support-fund activity in the selected periods.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <p className="text-xs text-muted-foreground mb-2">
          Distribution across {data.sampleSize} order
          {data.sampleSize === 1 ? '' : 's'}
        </p>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="bg-emerald-500"
            style={{ width: `${data.fullyRedeemedPct}%` }}
            title={`Fully redeemed: ${data.fullyRedeemedPct.toFixed(0)}%`}
          />
          <div
            className="bg-amber-400"
            style={{ width: `${data.underRedeemedPct}%` }}
            title={`Under-redeemed: ${data.underRedeemedPct.toFixed(0)}%`}
          />
          <div
            className="bg-rose-500"
            style={{ width: `${data.toppedUpPct}%` }}
            title={`Topped up: ${data.toppedUpPct.toFixed(0)}%`}
          />
        </div>
        <div className="mt-3 space-y-1.5 text-sm">
          <LegendRow
            color="bg-emerald-500"
            label="Fully redeemed"
            pct={data.fullyRedeemedPct}
          />
          <LegendRow
            color="bg-amber-400"
            label="Under-redeemed (balance left)"
            pct={data.underRedeemedPct}
          />
          <LegendRow
            color="bg-rose-500"
            label="Topped up (extra paid in)"
            pct={data.toppedUpPct}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-md border border-border bg-secondary/30 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Avg top-up
          </p>
          <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">
            {formatCurrency(data.avgTopUp)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            among topped-up orders
          </p>
        </div>
        <div className="rounded-md border border-border bg-secondary/30 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Avg leftover
          </p>
          <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">
            {formatCurrency(data.avgLeftover)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            among under-redeemed orders
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
