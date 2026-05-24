'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { formatCurrency, formatNumber } from '../../../../lib/formatters';
import {
  exportToCSV,
  exportToExcel,
  generateFilename,
} from '../../../../lib/reportExport';
import { cn } from '../../../../lib/utils';
import { PageHeader } from '../../../components/qq/page-header';
import { Button } from '../../../components/qq/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/qq/card';
import { Skeleton } from '../../../components/qq/skeleton';
import PeriodSelector from '../_components/PeriodSelector';

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

interface Payload {
  period: { window: string; from: string; to: string };
  dims: { row: Dim; col: DimOrNone; metric: Metric };
  columns: Array<{ key: string; label: string }>;
  rows: Array<{
    rowKey: string;
    rowLabel: string;
    cells: number[];
    rowTotal: number;
  }>;
  colTotals: number[];
  grandTotal: number;
  filterOptions: {
    companies: Array<{ id: string; name: string; subsidiaryId: string | null }>;
    subsidiaries: Array<{ id: string; name: string }>;
  };
}

const DIM_OPTIONS: Array<{ value: Dim; label: string }> = [
  { value: 'company', label: 'Company' },
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'class', label: 'Class' },
  { value: 'category', label: 'Category' },
  { value: 'product', label: 'Product' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
];

const METRIC_OPTIONS: Array<{ value: Metric; label: string }> = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'units', label: 'Units' },
  { value: 'orders', label: 'Orders' },
];

export default function SalesExplorerPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const row = (sp.get('row') as Dim) ?? 'company';
  const col = (sp.get('col') as DimOrNone) ?? 'month';
  const metric = (sp.get('metric') as Metric) ?? 'revenue';
  const window = (sp.get('window') as WindowKey) ?? '90d';
  const companyId = sp.get('companyId') ?? '';
  const subsidiaryId = sp.get('subsidiaryId') ?? '';

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams();
    qs.set('row', row);
    qs.set('col', col);
    qs.set('metric', metric);
    qs.set('window', window);
    if (window === 'custom') {
      const f = sp.get('from');
      const t = sp.get('to');
      if (f) qs.set('from', f);
      if (t) qs.set('to', t);
    }
    if (companyId) qs.set('companyId', companyId);
    if (subsidiaryId) qs.set('subsidiaryId', subsidiaryId);

    fetchWithAuth(`/api/reports/sales-explorer?${qs.toString()}`)
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
  }, [row, col, metric, window, companyId, subsidiaryId, sp]);

  const updateParam = (
    updates: Record<string, string | null>,
    extraDeletes: string[] = [],
  ) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === '') params.delete(k);
      else params.set(k, v);
    }
    for (const k of extraDeletes) params.delete(k);
    router.push(`/admin/reports/sales-explorer?${params.toString()}`);
  };

  const filteredCompanyOptions = useMemo(() => {
    if (!data) return [];
    if (!subsidiaryId) return data.filterOptions.companies;
    return data.filterOptions.companies.filter(
      (c) => c.subsidiaryId === subsidiaryId,
    );
  }, [data, subsidiaryId]);

  const formatValue = (v: number): string => {
    if (metric === 'revenue') return formatCurrency(v);
    return formatNumber(v);
  };

  const exportRows = useMemo(() => {
    if (!data) return [];
    const rowLabel = DIM_OPTIONS.find((d) => d.value === row)?.label ?? row;
    return data.rows.map((r) => {
      const o: Record<string, any> = { [rowLabel]: r.rowLabel };
      data.columns.forEach((c, i) => {
        o[c.label] = r.cells[i];
      });
      o['Total'] = r.rowTotal;
      return o;
    });
  }, [data, row]);

  const exportColumns = useMemo(() => {
    if (!data) return [];
    const rowLabel = DIM_OPTIONS.find((d) => d.value === row)?.label ?? row;
    const format = (v: any) =>
      metric === 'revenue'
        ? formatCurrency(Number(v) || 0)
        : formatNumber(Number(v) || 0);
    return [
      { key: rowLabel, label: rowLabel },
      ...data.columns.map((c) => ({ key: c.label, label: c.label, format })),
      { key: 'Total', label: 'Total', format },
    ];
  }, [data, row, metric]);

  const handleExport = (kind: 'csv' | 'xlsx') => {
    if (!data) return;
    const base = `sales-explorer-${metric}-by-${row}${col !== 'none' ? `-x-${col}` : ''}`;
    const filename = generateFilename(
      base,
      data.period.from.slice(0, 10),
      data.period.to.slice(0, 10),
    );
    if (kind === 'csv') exportToCSV(exportRows, exportColumns, filename);
    else exportToExcel(exportRows, exportColumns, filename);
  };

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Sales Explorer"
        description="Pivot any dimension against any other. Export the cut you need."
        breadcrumbs={
          <Link
            href="/admin/reports"
            className="text-muted-foreground hover:text-foreground"
          >
            ← Reports
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('csv')}
              disabled={loading || !data || data.rows.length === 0}
            >
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button
              size="sm"
              onClick={() => handleExport('xlsx')}
              disabled={loading || !data || data.rows.length === 0}
            >
              <Download className="h-4 w-4" /> Excel
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Controls */}
      <Card className="mb-6">
        <CardContent className="p-4 space-y-4">
          <div>
            <span className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Period
            </span>
            <PeriodSelector
              current={window}
              basePath="/admin/reports/sales-explorer"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <ControlSelect
              label="Rows"
              value={row}
              onChange={(v) => updateParam({ row: v as string })}
              options={DIM_OPTIONS}
            />
            <ControlSelect
              label="Columns"
              value={col}
              onChange={(v) => updateParam({ col: v as string })}
              options={[
                { value: 'none', label: '— None (flat list) —' },
                ...DIM_OPTIONS.filter((d) => d.value !== row),
              ]}
            />
            <ControlSelect
              label="Metric"
              value={metric}
              onChange={(v) => updateParam({ metric: v as string })}
              options={METRIC_OPTIONS}
            />
            <ControlSelect
              label="Subsidiary"
              value={subsidiaryId}
              onChange={(v) => {
                const params: Record<string, string | null> = {
                  subsidiaryId: (v as string) || null,
                };
                if (companyId && data) {
                  const co = data.filterOptions.companies.find(
                    (c) => c.id === companyId,
                  );
                  if (v && co?.subsidiaryId !== v) params.companyId = null;
                }
                updateParam(params);
              }}
              options={[
                { value: '', label: 'All subsidiaries' },
                ...(data?.filterOptions.subsidiaries ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                })),
              ]}
            />
            <ControlSelect
              label="Company"
              value={companyId}
              onChange={(v) =>
                updateParam({ companyId: (v as string) || null })
              }
              options={[
                { value: '', label: 'All companies' },
                ...filteredCompanyOptions.map((c) => ({
                  value: c.id,
                  label: c.name,
                })),
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Pivot table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2 flex-wrap gap-2">
          <CardTitle>
            {METRIC_OPTIONS.find((m) => m.value === metric)?.label} by{' '}
            {DIM_OPTIONS.find((d) => d.value === row)?.label}
            {col !== 'none' && (
              <> × {DIM_OPTIONS.find((d) => d.value === col)?.label}</>
            )}
          </CardTitle>
          {!loading && data && (
            <span className="text-xs text-muted-foreground">
              {data.rows.length} rows · {data.columns.length} columns · grand total{' '}
              <span className="font-mono text-foreground">
                {formatValue(data.grandTotal)}
              </span>
            </span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !data || data.rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No data for this slice. Try widening the period or relaxing filters.
            </div>
          ) : (
            <PivotTable data={data} formatValue={formatValue} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------

function ControlSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PivotTable({
  data,
  formatValue,
}: {
  data: Payload;
  formatValue: (v: number) => string;
}) {
  // Per-column heat scale (0..max in each column) so dense columns
  // don't drown out sparse ones. Subtle indigo tint.
  const colMax = data.columns.map((_, i) => {
    let m = 0;
    for (const r of data.rows) if (r.cells[i] > m) m = r.cells[i];
    return m;
  });

  function cellTint(value: number, columnIndex: number): React.CSSProperties {
    const max = colMax[columnIndex] || 0;
    if (max <= 0 || value <= 0) return {};
    const intensity = Math.min(1, value / max);
    // Subtle — cap at ~25% alpha so the text remains readable.
    return { backgroundColor: `rgba(99, 102, 241, ${(intensity * 0.25).toFixed(3)})` };
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-secondary">
          <tr className="border-b border-border">
            <th className="text-left font-semibold text-foreground text-xs uppercase tracking-wider px-3 py-2 sticky left-0 bg-secondary z-10">
              {/* row dim header */}
              {DIM_OPTIONS.find((d) => d.value === data.dims.row)?.label}
            </th>
            {data.columns.map((c) => (
              <th
                key={c.key}
                className="text-right font-semibold text-foreground text-xs uppercase tracking-wider px-3 py-2 whitespace-nowrap"
              >
                {c.label}
              </th>
            ))}
            <th className="text-right font-semibold text-foreground text-xs uppercase tracking-wider px-3 py-2 border-l border-border whitespace-nowrap">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.rowKey} className="border-b border-border last:border-0 hover:bg-secondary/40">
              <td className="px-3 py-2 text-foreground font-medium whitespace-nowrap sticky left-0 bg-card z-10">
                {r.rowLabel}
              </td>
              {r.cells.map((v, i) => (
                <td
                  key={i}
                  className="px-3 py-2 text-right font-mono tabular-nums text-sm whitespace-nowrap"
                  style={cellTint(v, i)}
                >
                  {v === 0 ? <span className="text-muted-foreground">—</span> : formatValue(v)}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-mono tabular-nums text-sm whitespace-nowrap border-l border-border font-semibold">
                {formatValue(r.rowTotal)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-secondary/60">
          <tr className="border-t border-border">
            <td className="px-3 py-2 text-foreground font-semibold text-xs uppercase tracking-wider sticky left-0 bg-secondary/60 z-10">
              Total
            </td>
            {data.colTotals.map((v, i) => (
              <td
                key={i}
                className="px-3 py-2 text-right font-mono tabular-nums text-sm whitespace-nowrap font-semibold"
              >
                {formatValue(v)}
              </td>
            ))}
            <td className="px-3 py-2 text-right font-mono tabular-nums text-sm whitespace-nowrap border-l border-border font-bold">
              {formatValue(data.grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
