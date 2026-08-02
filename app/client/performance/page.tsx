'use client';

/**
 * Client-facing performance page — the partner's own view of the admin
 * per-company drill-down. Same payload and visuals, but the API scopes
 * the company server-side to the caller's own (never a parameter), and
 * Qiqi-internal details (NetSuite number, subsidiary) are not shown.
 * Support-fund tiles/columns are hidden entirely for non-enrolled
 * companies. Gated on the 'reports' permission, like "Your company".
 */

import { useCallback, useEffect, useState } from 'react';

import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import type { CompanyPerformance } from '../../../lib/companyPerformance';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { Input } from '../../components/qq/input';
import { Alert, AlertDescription } from '../../components/qq/alert';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../../components/qq/table';
import TopTable from '../../admin/reports/_components/TopTable';
import { StatusPill, ProgressBar } from '../../admin/reports/_components/PeriodStatus';

const money = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const WINDOWS = [
  { key: 'this-month', label: 'This Month' },
  { key: 'last-month', label: 'Last Month' },
  { key: 'this-year', label: 'This Year' },
  { key: 'last-year', label: 'Last Year' },
] as const;

function fmtDate(d: string | null) {
  return d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', day: 'numeric' }) : '—';
}

export default function ClientPerformancePage() {
  const [data, setData] = useState<CompanyPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [windowKey, setWindowKey] = useState<string>('this-month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const load = useCallback(async (key: string, from?: string, to?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ window: key });
      if (key === 'custom' && from && to) {
        qs.set('from', from);
        qs.set('to', to);
      }
      const res = await fetchWithAuth(`/api/client/performance?${qs}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to load performance.');
      setData(payload);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load('this-month');
  }, [load]);

  const pickWindow = (key: string) => {
    setWindowKey(key);
    load(key);
  };
  const applyCustom = () => {
    if (!customFrom || !customTo || customFrom > customTo) return;
    setWindowKey('custom');
    load('custom', customFrom, customTo);
  };

  const company = data?.company;
  const isEnrolled = company?.isEnrolled ?? false;
  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="px-6 py-8 space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Performance</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {company?.name && <span className="mr-2">{company.name}</span>}
          {company?.agreementStart && (
            <span>
              Agreement: {fmtDate(company.agreementStart)} → {fmtDate(company.agreementEnd)}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Revenue counts orders when they were completed (plus any historical sales recorded
          before the Hub).
        </p>
      </div>

      {/* To-date tiles */}
      <div className={`grid grid-cols-2 ${isEnrolled ? 'lg:grid-cols-5' : 'lg:grid-cols-2'} gap-3 sm:gap-4`}>
        <Tile label="Total sales to date" value={loading && !data ? '—' : money(data?.toDate.sales ?? 0)} />
        <Tile label="Orders to date" value={loading && !data ? '—' : String(data?.toDate.orders ?? 0)} />
        {isEnrolled && (
          <>
            <Tile label="SF earned to date" value={loading && !data ? '—' : money(data?.toDate.sfEarned ?? 0)} />
            <Tile label="SF redeemed to date" value={loading && !data ? '—' : money(data?.toDate.sfUsed ?? 0)} />
            <Tile
              label="SF balance"
              value={loading && !data ? '—' : money(data?.toDate.sfBalance ?? 0)}
              sub={data && data.toDate.sfBalance < 0 ? 'topped up beyond earned' : undefined}
            />
          </>
        )}
      </div>

      {/* Periods (Years) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Target periods</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {data && data.periods.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-4">No target periods defined yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="hidden md:table-cell">Dates</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  {isEnrolled && (
                    <TableHead className="hidden lg:table-cell text-right">SF earned / used</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.periods ?? []).map((p) => (
                  <TableRow key={p.periodId}>
                    <TableCell className="text-sm font-medium">
                      {p.periodName || '—'}
                      {p.endDate < todayISO ? (
                        <span className="ml-2 inline-flex text-[10px] font-medium uppercase tracking-wide text-muted-foreground border border-border rounded-sm px-1.5 py-0.5">
                          Ended
                        </span>
                      ) : p.startDate <= todayISO ? (
                        <span className="ml-2 inline-flex text-[10px] font-medium uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-sm px-1.5 py-0.5">
                          Active
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {fmtDate(p.startDate)} → {fmtDate(p.endDate)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{money(p.target)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{money(p.actual)}</TableCell>
                    <TableCell className="min-w-[160px]">
                      <ProgressBar pct={p.progressPct} expectedPct={p.expectedPct} />
                    </TableCell>
                    <TableCell>
                      <StatusPill status={p.status} />
                    </TableCell>
                    {isEnrolled && (
                      <TableCell className="hidden lg:table-cell text-right font-mono text-xs text-muted-foreground">
                        {money(p.sfEarned)} / {money(p.sfUsed)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Windowed view */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <CardTitle className="text-sm">Activity in period</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {WINDOWS.map((w) => (
                <Button
                  key={w.key}
                  size="sm"
                  variant={windowKey === w.key ? 'default' : 'outline'}
                  onClick={() => pickWindow(w.key)}
                >
                  {w.label}
                </Button>
              ))}
              <div className="flex items-center gap-1.5">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-36 h-8" />
                <span className="text-xs text-muted-foreground">→</span>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-36 h-8" />
                <Button
                  size="sm"
                  variant={windowKey === 'custom' ? 'default' : 'outline'}
                  onClick={applyCustom}
                  disabled={!customFrom || !customTo || customFrom > customTo}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Tile label="Sales" value={loading ? '—' : money(data?.window.sales ?? 0)} />
            <Tile label="Orders" value={loading ? '—' : String(data?.window.orders ?? 0)} />
            <Tile label="Units" value={loading ? '—' : String(data?.window.units ?? 0)} />
            <Tile label="Distinct products" value={loading ? '—' : String(data?.window.productCount ?? 0)} />
          </div>

          <div>
            <p className="text-sm font-semibold mb-2">Top products in period</p>
            <TopTable
              rows={data?.window.topProducts ?? []}
              emptyMessage={loading ? 'Loading…' : 'No completed orders in this period.'}
              columns={[
                { header: '#', key: 'rank', width: 'w-8', render: (row: any) => (data?.window.topProducts ?? []).indexOf(row) + 1 },
                { header: 'Product', key: 'name', render: (row: any) => row.name ?? '—' },
                { header: 'SKU', key: 'sku', render: (row: any) => <span className="font-mono text-xs">{row.sku ?? '—'}</span> },
                { header: 'Units', key: 'units', align: 'right' },
                { header: 'Revenue', key: 'revenue', align: 'right', render: (row: any) => <span className="font-mono">{money(row.revenue)}</span> },
              ]}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-amber-700 truncate">{sub}</p>}
    </Card>
  );
}
