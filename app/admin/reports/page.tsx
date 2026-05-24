'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, Boxes, Building2, PiggyBank } from 'lucide-react';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { formatCurrency, formatNumber } from '../../../lib/formatters';
import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import { Skeleton } from '../../components/qq/skeleton';
import KpiCard from './_components/KpiCard';
import PeriodSelector from './_components/PeriodSelector';
import SalesTrendChart, { type TrendPoint } from './_components/SalesTrendChart';
import StatusFunnelChart, { type FunnelRow } from './_components/StatusFunnelChart';
import TopTable from './_components/TopTable';

interface Kpi {
  value: number;
  deltaPct: number | null;
}

interface DashboardPayload {
  period: { window: string; from: string; to: string };
  kpis: {
    totalSales: Kpi;
    activePartners: Kpi;
    aov: Kpi;
    supportFundUsed: Kpi;
    orders: Kpi;
  };
  trend: TrendPoint[];
  funnel: FunnelRow[];
  topCompanies: Array<{ companyId: string; name: string; orders: number; revenue: number }>;
  topProducts: Array<{ productId: number; sku: string | null; name: string | null; units: number; revenue: number }>;
}

const OTHER_REPORTS = [
  {
    name: 'Company Performance',
    description: 'Goal pace, slipping partners, support-fund behavior',
    href: '/admin/reports/company-performance',
    icon: Building2,
  },
  {
    name: 'Product Insights',
    description: 'Top SKUs, top buyers, dead products, category heatmap',
    href: '/admin/reports/product-insights',
    icon: Boxes,
  },
  {
    name: 'Support Funds',
    description: 'Earned, used, leftover, top-up behavior, top SF products',
    href: '/admin/reports/support-funds',
    icon: PiggyBank,
  },
  {
    name: 'Sales Explorer',
    description: 'Pivot any dimension × any other, with CSV/XLSX export',
    href: '/admin/reports/sales-explorer',
    icon: BarChart3,
  },
];

export default function ExecutiveDashboardPage() {
  const sp = useSearchParams();
  const window = sp.get('window') ?? '30d';

  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    query.set('window', window);
    const from = sp.get('from');
    const to = sp.get('to');
    if (from) query.set('from', from);
    if (to) query.set('to', to);

    fetchWithAuth(`/api/reports/executive?${query.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load dashboard');
        return json as DashboardPayload;
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
  }, [window, sp]);

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Executive Dashboard"
        description="Sales, partners and order flow at a glance."
        actions={<PeriodSelector current={window} basePath="/admin/reports" />}
      />

      {error && (
        <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          label="Total Sales"
          value={loading || !data ? '—' : formatCurrency(data.kpis.totalSales.value)}
          deltaPct={data?.kpis.totalSales.deltaPct ?? null}
        />
        <KpiCard
          label="Active Partners"
          value={loading || !data ? '—' : formatNumber(data.kpis.activePartners.value)}
          deltaPct={data?.kpis.activePartners.deltaPct ?? null}
        />
        <KpiCard
          label="Avg Order Value"
          value={loading || !data ? '—' : formatCurrency(data.kpis.aov.value)}
          deltaPct={data?.kpis.aov.deltaPct ?? null}
        />
        <KpiCard
          label="Support Fund Used"
          value={loading || !data ? '—' : formatCurrency(data.kpis.supportFundUsed.value)}
          deltaPct={data?.kpis.supportFundUsed.deltaPct ?? null}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-baseline justify-between space-y-0 pb-2">
            <CardTitle>Sales trend</CardTitle>
            <span className="text-xs text-muted-foreground">
              Daily, committed orders only
            </span>
          </CardHeader>
          <CardContent>
            {loading ? <ChartSkeleton /> : <SalesTrendChart data={data?.trend ?? []} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-baseline justify-between space-y-0 pb-2">
            <CardTitle>Order status</CardTitle>
            <span className="text-xs text-muted-foreground">Live</span>
          </CardHeader>
          <CardContent>
            {loading ? <ChartSkeleton /> : <StatusFunnelChart data={data?.funnel ?? []} />}
          </CardContent>
        </Card>
      </div>

      {/* Top tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Top 10 Companies</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <TopTable
              rows={data?.topCompanies ?? []}
              emptyMessage={loading ? 'Loading…' : 'No companies in this period'}
              columns={[
                { header: 'Company', key: 'name' },
                {
                  header: 'Orders',
                  key: 'orders',
                  align: 'right',
                  render: (r) => formatNumber(r.orders),
                  width: '100px',
                },
                {
                  header: 'Revenue',
                  key: 'revenue',
                  align: 'right',
                  render: (r) => formatCurrency(r.revenue),
                  width: '140px',
                },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Top 10 Products</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <TopTable
              rows={data?.topProducts ?? []}
              emptyMessage={loading ? 'Loading…' : 'No products sold in this period'}
              columns={[
                {
                  header: 'SKU',
                  key: 'sku',
                  render: (r) => (
                    <span className="font-mono text-xs">{r.sku ?? '—'}</span>
                  ),
                  width: '110px',
                },
                {
                  header: 'Product',
                  key: 'name',
                  render: (r) => r.name ?? '—',
                },
                {
                  header: 'Units',
                  key: 'units',
                  align: 'right',
                  render: (r) => formatNumber(r.units),
                  width: '90px',
                },
                {
                  header: 'Revenue',
                  key: 'revenue',
                  align: 'right',
                  render: (r) => formatCurrency(r.revenue),
                  width: '130px',
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      {/* Other reports nav */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          More reports
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {OTHER_REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <Link
                key={r.href}
                href={r.href}
                className="group flex items-start gap-3 rounded-md border border-border bg-card px-4 py-3 hover:border-foreground/40 hover:bg-secondary/40 transition-colors"
              >
                <Icon className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-sm font-medium text-foreground">
                    {r.name}
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-72 w-full" />;
}
