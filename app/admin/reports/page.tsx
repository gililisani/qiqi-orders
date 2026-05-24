'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, Boxes, Building2, Target } from 'lucide-react';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { formatCurrency, formatNumber } from '../../../lib/formatters';
import Card from '../../components/ui/Card';
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
    name: 'Company Annual Goals',
    description: 'Per-company target progress and trajectory',
    href: '/admin/reports/company-goals',
    icon: Target,
  },
  {
    name: 'Company Performance',
    description: 'Trends, comparisons and health signals',
    href: '/admin/reports/company-performance',
    icon: Building2,
  },
  {
    name: 'Sales',
    description: 'Filterable orders ledger with CSV/XLSX export',
    href: '/admin/reports/sales',
    icon: BarChart3,
  },
  {
    name: 'Product Sales',
    description: 'Units, revenue and top buyers per SKU',
    href: '/admin/reports/product-sales',
    icon: Boxes,
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
    <div className="mt-8 mb-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Executive Dashboard</h1>
          <p className="text-gray-600 mt-1 text-sm">
            Sales, partners and order flow at a glance.
          </p>
        </div>
        <PeriodSelector current={window} />
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          deltaPct={null}
          hint="this period"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          className="lg:col-span-2"
          header={
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-gray-900">Sales trend</h2>
              <span className="text-xs text-gray-500">Daily, committed orders only</span>
            </div>
          }
        >
          {loading ? <ChartSkeleton /> : <SalesTrendChart data={data?.trend ?? []} />}
        </Card>
        <Card
          header={
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-gray-900">Order status</h2>
              <span className="text-xs text-gray-500">Live</span>
            </div>
          }
        >
          {loading ? <ChartSkeleton /> : <StatusFunnelChart data={data?.funnel ?? []} />}
        </Card>
      </div>

      {/* Top tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          header={<h2 className="text-base font-semibold text-gray-900">Top 10 Companies</h2>}
        >
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
        </Card>
        <Card
          header={<h2 className="text-base font-semibold text-gray-900">Top 10 Products</h2>}
        >
          <TopTable
            rows={data?.topProducts ?? []}
            emptyMessage={loading ? 'Loading…' : 'No products sold in this period'}
            columns={[
              {
                header: 'SKU',
                key: 'sku',
                render: (r) => <span className="font-mono text-xs">{r.sku ?? '—'}</span>,
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
                width: '80px',
              },
              {
                header: 'Revenue',
                key: 'revenue',
                align: 'right',
                render: (r) => formatCurrency(r.revenue),
                width: '120px',
              },
            ]}
          />
        </Card>
      </div>

      {/* Other reports nav */}
      <div className="pt-2">
        <h2 className="text-sm font-medium text-gray-700 mb-3">More reports</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {OTHER_REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <Link
                key={r.href}
                href={r.href}
                className="group flex items-start gap-3 rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 hover:border-gray-400 transition-colors"
              >
                <Icon className="h-5 w-5 text-gray-500 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                    {r.name}
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{r.description}</div>
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
  return <div className="h-72 w-full animate-pulse rounded-lg bg-gray-100" />;
}
