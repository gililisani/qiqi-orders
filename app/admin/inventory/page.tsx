'use client';

/**
 * Inventory Check — NetSuite stock vs the warehouse's own system (ShipHero
 * at BrandFox), per SKU, for each ships-from location. Taken nightly and on
 * demand; every check is kept so a difference can be dated. Read-only
 * towards both systems.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';

import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { formatDateTime, formatNumber } from '../../../lib/formatters';
import { lineDifference, lineStatus, type CheckLine, type LineStatus } from '../../../lib/inventoryCheck/compare';
import type { InventoryCheckView } from '../../../lib/inventoryCheck/read';
import { useToast } from '../../components/ui/ToastProvider';
import { PageHeader } from '../../components/qq/page-header';
import { Button } from '../../components/qq/button';
import { Input } from '../../components/qq/input';
import { Badge } from '../../components/qq/badge';
import { Alert, AlertDescription } from '../../components/qq/alert';
import { Card, CardContent } from '../../components/qq/card';
import { Skeleton } from '../../components/qq/skeleton';
import { Tabs, TabsList, TabsTrigger } from '../../components/qq/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/qq/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/qq/table';

type View = InventoryCheckView & { unavailable: string | null };

const signed = (n: number) => (n > 0 ? `+${formatNumber(n)}` : n < 0 ? `−${formatNumber(-n)}` : '0');

const SIDE_LABEL: Record<Exclude<LineStatus, 'match' | 'different'>, string> = {
  ns_only: 'Only in NetSuite',
  wms_only: 'Only in ShipHero',
};

function toCsv(lines: CheckLine[], checkedAt: string): string {
  const head = ['SKU', 'Product', 'NetSuite on hand', 'NetSuite committed', 'ShipHero on hand', 'ShipHero allocated', 'ShipHero non-sellable', 'Difference (NetSuite − ShipHero)', 'In Hub catalog'];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = lines.map((l) =>
    [l.sku, l.name, l.ns_on_hand, l.ns_committed, l.wms_on_hand, l.wms_allocated, l.wms_non_sellable, lineDifference(l), l.in_catalog ? 'yes' : 'no'].map(cell).join(','),
  );
  return [`Inventory check ${checkedAt}`, head.join(','), ...rows].join('\n');
}

export default function InventoryCheckPage() {
  const toast = useToast();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [tab, setTab] = useState<'differences' | 'all'>('differences');
  const [search, setSearch] = useState('');

  const load = useCallback(async (loc: string | null, check: string | null) => {
    try {
      const qs = new URLSearchParams();
      if (loc) qs.set('location', loc);
      if (check) qs.set('check', check);
      const res = await fetchWithAuth(`/api/inventory-check?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load.');
      setView(json);
      setLocationId(json.locationId);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load(null, null);
  }, [load]);

  const checkNow = async () => {
    setChecking(true);
    try {
      const res = await fetchWithAuth('/api/inventory-check', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'The check failed.');
      toast.success(json.reused ? 'A check just ran — showing it.' : 'Inventory checked.');
      setCheckId(null);
      await load(locationId, null);
    } catch (err: any) {
      toast.error(err.message);
      await load(locationId, null);
    } finally {
      setChecking(false);
    }
  };

  const lines = useMemo(() => view?.lines ?? [], [view]);
  const counts = useMemo(() => {
    const c = { match: 0, different: 0, oneSide: 0, unitsOff: 0 };
    for (const l of lines) {
      const s = lineStatus(l);
      if (s === 'match') c.match += 1;
      else if (s === 'different') c.different += 1;
      else c.oneSide += 1;
      if (l.in_catalog) c.unitsOff += Math.abs(lineDifference(l));
    }
    return c;
  }, [lines]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter(
      (l) =>
        (tab === 'all' || lineStatus(l) !== 'match') &&
        (!q || l.sku.toLowerCase().includes(q) || (l.name ?? '').toLowerCase().includes(q)),
    );
  }, [lines, tab, search]);
  const products = shown.filter((l) => l.in_catalog);
  const others = shown.filter((l) => !l.in_catalog);

  const check = view?.check ?? null;
  const location = view?.locations.find((l) => l.id === locationId);
  const warehouses = check?.warehouses.length ? check.warehouses.join(', ') : 'ShipHero';

  const download = () => {
    if (!check) return;
    const blob = new Blob([toCsv(lines, formatDateTime(check.checkedAt))], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-check-${check.checkedAt.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title="Inventory Check"
        description="NetSuite stock compared with the warehouse's own system (ShipHero at BrandFox), per SKU. Checked every night and whenever you click Check now."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {check && (
              <Button variant="outline" size="sm" onClick={download}>
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
            )}
            <Button size="sm" onClick={checkNow} disabled={checking || !!view?.unavailable}>
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking…' : 'Check now'}
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {view?.unavailable && (
        <Alert variant="info">
          <AlertDescription>{view.unavailable} Checks run where both systems are connected (production).</AlertDescription>
        </Alert>
      )}

      {!view && !error ? (
        <Skeleton className="h-64 w-full" />
      ) : view && !view.locations.length ? (
        <Alert variant="warning">
          <AlertDescription>No ships-from location is set. Choose one in Settings → Fulfillment.</AlertDescription>
        </Alert>
      ) : view ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            {view.locations.length > 1 && (
              <div className="w-56">
                <Select
                  value={locationId ?? undefined}
                  onValueChange={(v) => {
                    setLocationId(v);
                    setCheckId(null);
                    load(v, null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Location" />
                  </SelectTrigger>
                  <SelectContent>
                    {view.locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {view.history.length > 0 && (
              <div className="w-80">
                <Select
                  value={check?.id}
                  onValueChange={(v) => {
                    setCheckId(v);
                    load(locationId, v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Check" />
                  </SelectTrigger>
                  <SelectContent>
                    {view.history.map((h, i) => (
                      <SelectItem key={h.id} value={h.id}>
                        {formatDateTime(h.checkedAt)} · {h.trigger === 'nightly' ? 'nightly' : 'manual'}
                        {h.error ? ' · failed' : ` · ${h.different} different`}
                        {i === 0 ? ' (latest)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="text-sm text-muted-foreground pb-2">
              {check
                ? `NetSuite location ${location?.name ?? ''} vs ShipHero ${warehouses}. Checked ${formatDateTime(check.checkedAt)}${check.checkedBy ? ` by ${check.checkedBy}` : check.trigger === 'nightly' ? ' (nightly)' : ''}.`
                : `${location?.name ?? 'This location'} has not been checked yet.`}
            </p>
          </div>

          {check?.error && (
            <Alert variant="destructive">
              <AlertDescription>This check failed: {check.error}</AlertDescription>
            </Alert>
          )}

          {check && !check.error && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { label: 'SKUs compared', value: formatNumber(lines.length) },
                  { label: 'Match', value: formatNumber(counts.match) },
                  { label: 'Different', value: formatNumber(counts.different + counts.oneSide) },
                  { label: 'Product units off', value: formatNumber(counts.unitsOff), hint: 'Hub products only' },
                ].map((c) => (
                  <Card key={c.label}>
                    <CardContent className="px-4 py-4">
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
                      {c.hint && <p className="text-xs text-muted-foreground">{c.hint}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Tabs value={tab} onValueChange={(v) => setTab(v as 'differences' | 'all')}>
                  <TabsList>
                    <TabsTrigger value="differences">Differences ({counts.different + counts.oneSide})</TabsTrigger>
                    <TabsTrigger value="all">All ({lines.length})</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="w-full sm:w-64">
                  <Input placeholder="Search SKU or product" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>

              {shown.length === 0 ? (
                <Card>
                  <CardContent className="px-6 py-8 text-sm text-muted-foreground">
                    {tab === 'differences' && !search ? 'NetSuite and ShipHero match for every SKU.' : 'Nothing matches your search.'}
                  </CardContent>
                </Card>
              ) : (
                <>
                  {products.length > 0 && (
                    <StockTable title="Hub products" lines={products} previous={view.previous} />
                  )}
                  {others.length > 0 && (
                    <StockTable
                      title="Other items"
                      subtitle="Components, packaging and SKUs that are not Hub products"
                      lines={others}
                      previous={view.previous}
                    />
                  )}
                </>
              )}

              <p className="text-xs text-muted-foreground">
                Difference = NetSuite on hand − ShipHero on hand. A positive number means NetSuite shows more than the
                warehouse. Committed (NetSuite) and allocated (ShipHero) are orders not shipped yet: an order BrandFox
                has shipped but NetSuite has not fulfilled shows as NetSuite higher until it is fulfilled. Non-sellable
                units (damaged or on hold at BrandFox) are not in ShipHero&apos;s on hand.
                {view.previous ? ` “Was” compares with the check of ${formatDateTime(view.previous.checkedAt)}.` : ''}
              </p>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function StockTable({
  title,
  subtitle,
  lines,
  previous,
}: {
  title: string;
  subtitle?: string;
  lines: CheckLine[];
  previous: InventoryCheckView['previous'];
}) {
  return (
    <Card>
      <CardContent className="px-0 py-0">
        <div className="px-6 pt-4 pb-2">
          <p className="text-sm font-medium">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="hidden md:table-cell">Product</TableHead>
              <TableHead className="text-right">NetSuite</TableHead>
              <TableHead className="text-right">ShipHero</TableHead>
              <TableHead className="text-right">Difference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => {
              const status = lineStatus(l);
              const diff = lineDifference(l);
              const was = previous ? previous.differences[l.sku] : undefined;
              const changed = previous !== null && (was ?? 0) !== diff;
              return (
                <TableRow key={l.sku}>
                  <TableCell className="text-sm font-medium whitespace-nowrap">
                    {l.sku}
                    {l.wms_kit && (
                      <Badge variant="muted" className="ml-2">
                        Kit
                      </Badge>
                    )}
                    <p className="md:hidden text-xs font-normal text-muted-foreground">{l.name}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{l.name ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {l.ns_on_hand === null ? '—' : formatNumber(l.ns_on_hand)}
                    {!!l.ns_committed && <p className="text-xs text-muted-foreground">{formatNumber(l.ns_committed)} committed</p>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {l.wms_on_hand === null ? '—' : formatNumber(l.wms_on_hand)}
                    {!!l.wms_allocated && <p className="text-xs text-muted-foreground">{formatNumber(l.wms_allocated)} allocated</p>}
                    {!!l.wms_non_sellable && (
                      <p className="text-xs text-muted-foreground">+{formatNumber(l.wms_non_sellable)} non-sellable</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap">
                    {status === 'match' ? (
                      <Badge variant="success">Match</Badge>
                    ) : (
                      <>
                        <span className={`tabular-nums font-medium ${diff > 0 ? 'text-amber-700' : 'text-brand-magenta'}`}>{signed(diff)}</span>
                        <p className="text-xs text-muted-foreground">
                          {status === 'different' ? (diff > 0 ? 'NetSuite higher' : 'ShipHero higher') : SIDE_LABEL[status]}
                        </p>
                      </>
                    )}
                    {changed && <p className="text-xs text-muted-foreground">was {was === undefined ? '—' : signed(was)}</p>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
