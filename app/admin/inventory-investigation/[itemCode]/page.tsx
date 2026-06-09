'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RefreshCw, PackageSearch, AlertTriangle, ArrowLeft } from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/qq/card';
import { Button } from '../../../components/qq/button';
import { EmptyState } from '../../../components/qq/empty-state';
import { Badge } from '../../../components/qq/badge';

import {
  computeLedger,
  summarizeNegatives,
  type LedgerTxn,
  type OpeningBalance,
} from '@/lib/inventory/balanceEngine';
import { buildTableRows, fmtQty } from '../../../components/inventory/inventoryView';
import { InventoryTimeline } from '../../../components/inventory/InventoryTimeline';
import { InventoryTransactionTable } from '../../../components/inventory/InventoryTransactionTable';
import { InventorySimulator } from '../../../components/inventory/InventorySimulator';

interface Payload {
  cached: boolean;
  itemCode: string;
  itemName?: string | null;
  itemType?: string | null;
  lastRefreshedAt?: string | null;
  transactions?: LedgerTxn[];
  openings?: OpeningBalance[];
  corrections?: Record<string, { date: string; qty: number }[]>;
  snapshotsApplied?: boolean;
  planMarkers?: { nsTransactionId: string }[];
}

export default function InventoryInvestigationPage() {
  const params = useParams<{ itemCode: string }>();
  const router = useRouter();
  const itemCode = decodeURIComponent(String(params.itemCode || '')).toUpperCase();

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read deep-link params from window.location (not useSearchParams) to avoid a
  // Suspense-boundary requirement at build time.
  const locParam =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('loc') : null;
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);

  // Preselect the suspect transaction when arriving from the worklist (?tx=).
  // Read from window (not useSearchParams) to avoid a Suspense boundary at build.
  useEffect(() => {
    const tx = new URLSearchParams(window.location.search).get('tx');
    if (tx) setSelectedTxnId(tx);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/inventory-investigation/${encodeURIComponent(itemCode)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData(json);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [itemCode]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/inventory-investigation/${encodeURIComponent(itemCode)}/refresh`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Refresh failed');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const txns = data?.transactions ?? [];
  const openings = data?.openings ?? [];
  const plannedTxnIds = useMemo(
    () => new Set((data?.planMarkers ?? []).map((m) => m.nsTransactionId)),
    [data],
  );

  // Re-anchor corrections from dated trusted snapshots (sent as a plain object).
  const corrections = useMemo(() => {
    const raw = data?.corrections ?? {};
    const m = new Map<string, { date: string; qty: number }[]>();
    for (const [locId, pts] of Object.entries(raw)) if (Array.isArray(pts) && pts.length) m.set(locId, pts);
    return m;
  }, [data]);

  const ledger = useMemo(() => computeLedger(txns, openings, corrections), [txns, openings, corrections]);
  const negatives = useMemo(() => summarizeNegatives(ledger), [ledger]);
  const tableRows = useMemo(() => buildTableRows(ledger), [ledger]);
  const negList = useMemo(
    () => Object.values(negatives).sort((a, b) => a.deepestBalance - b.deepestBalance),
    [negatives],
  );
  const suspectCount = ledger.suspectRowIds.size;

  // Phantom residuals: NS current on-hand vs the zero-anchored transaction history.
  // Balances are run forward from zero (matching NetSuite's day-by-day), so a
  // nonzero residual means NS on-hand can't be explained by visible transactions
  // (a pre-history / migration artifact). Surfaced, not smeared into the curve.
  const residuals = useMemo(
    () =>
      openings
        .map((o) => {
          const final = ledger.byLocation[o.locationNsId]?.final ?? 0;
          const residual = Math.round(((o.currentQoh ?? 0) - final) * 100) / 100;
          return { name: o.locationName, qoh: o.currentQoh ?? 0, residual };
        })
        .filter((r) => r.residual !== 0),
    [openings, ledger],
  );

  return (
    <div className="px-6 py-8">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-muted-foreground" />
            {itemCode}
            {data?.itemType && <Badge variant="secondary">{data.itemType}</Badge>}
          </span>
        }
        description={data?.itemName || 'Inventory investigation'}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admin/inventory-investigation')}>
              <ArrowLeft className="h-4 w-4" /> All items
            </Button>
            <Button onClick={refresh} loading={refreshing}>
              <RefreshCw className="h-4 w-4" /> Refresh from NetSuite
            </Button>
          </div>
        }
      />

      {data?.lastRefreshedAt && (
        <p className="text-xs text-muted-foreground -mt-2 mb-4">
          Last refreshed {new Date(data.lastRefreshedAt).toLocaleString()}
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
      ) : !data?.cached ? (
        <EmptyState
          icon={<PackageSearch />}
          title={`No cached data for ${itemCode}`}
          description="Pull this item's full inventory history from NetSuite to begin investigating. This may take a few seconds."
          action={
            <Button onClick={refresh} loading={refreshing}>
              <RefreshCw className="h-4 w-4" /> Refresh from NetSuite
            </Button>
          }
        />
      ) : txns.length === 0 ? (
        <EmptyState
          icon={<PackageSearch />}
          title="No inventory-affecting transactions"
          description={`${itemCode} resolved in NetSuite but has no inventory-affecting transaction lines.`}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
          {/* Left column: timeline + table */}
          <div className="space-y-4 min-w-0">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Timeline</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {openings.length} locations · {txns.length} transactions ·{' '}
                  <span className={suspectCount ? 'text-destructive font-medium' : ''}>{suspectCount} suspect</span>
                </span>
              </CardHeader>
              <CardContent>
                <InventoryTimeline
                  ledger={ledger}
                  negatives={negatives}
                  selectedTxnId={selectedTxnId}
                  onSelectTxn={setSelectedTxnId}
                  plannedTxnIds={plannedTxnIds}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <InventoryTransactionTable
                  rows={tableRows}
                  selectedTxnId={selectedTxnId}
                  onSelectTxn={setSelectedTxnId}
                  initialLocation={locParam ? openings.find((o) => o.locationNsId === locParam)?.locationName : undefined}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right rail: current state + simulator placeholder */}
          <div className="space-y-4 xl:sticky xl:top-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 ${negList.length ? 'text-destructive' : 'text-muted-foreground'}`} />
                  Current State
                </CardTitle>
              </CardHeader>
              <CardContent>
                {negList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No location goes negative. 🎉</p>
                ) : (
                  <ul className="space-y-2">
                    {negList.map((nl) => (
                      <li key={nl.locationNsId} className="text-sm">
                        <div className="font-medium">{nl.locationName}</div>
                        <div className="text-destructive">
                          deepest {fmtQty(nl.deepestBalance)} on {nl.deepestDate}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {nl.spans.length} negative {nl.spans.length === 1 ? 'period' : 'periods'}
                          {nl.spans[0] && ` · since ${nl.spans[0].from}${nl.spans[0].to ? ` to ${nl.spans[0].to}` : ' (ongoing)'}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {residuals.length > 0 && (
                  <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <div className="font-semibold">⚠️ Data note — NS on-hand vs transaction history</div>
                    <p className="mt-0.5">
                      Balances run forward from zero (matching NetSuite day-by-day). At these locations
                      NetSuite&apos;s current on-hand can&apos;t be fully explained by visible transactions —
                      a pre-history/migration artifact. Depths are accurate to NS; the gap is shown for transparency.
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {residuals.map((r) => (
                        <li key={r.name} className="flex justify-between gap-2 font-mono">
                          <span className="truncate">{r.name}</span>
                          <span>NS {fmtQty(r.qoh)} · unexplained {fmtQty(r.residual)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Fix Simulator</CardTitle>
              </CardHeader>
              <CardContent>
                <InventorySimulator
                  itemCode={itemCode}
                  txns={txns}
                  openings={openings}
                  corrections={corrections}
                  selectedTxnId={selectedTxnId}
                  plannedTxnIds={plannedTxnIds}
                  onMarkersChanged={load}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
