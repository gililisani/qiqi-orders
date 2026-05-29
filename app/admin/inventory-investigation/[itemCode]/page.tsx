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

interface Payload {
  cached: boolean;
  itemCode: string;
  itemName?: string | null;
  itemType?: string | null;
  lastRefreshedAt?: string | null;
  transactions?: LedgerTxn[];
  openings?: OpeningBalance[];
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
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);

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

  const ledger = useMemo(() => computeLedger(txns, openings), [txns, openings]);
  const negatives = useMemo(() => summarizeNegatives(ledger), [ledger]);
  const tableRows = useMemo(() => buildTableRows(ledger), [ledger]);
  const negList = useMemo(
    () => Object.values(negatives).sort((a, b) => a.deepestBalance - b.deepestBalance),
    [negatives],
  );
  const suspectCount = ledger.suspectRowIds.size;

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
                <InventoryTransactionTable rows={tableRows} selectedTxnId={selectedTxnId} onSelectTxn={setSelectedTxnId} />
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Simulator</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedTxnId ? (
                  <SelectedTxnPreview ledger={ledger} txnId={selectedTxnId} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Click a marker on the timeline or a row in the table to select a transaction.
                  </p>
                )}
                <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
                  The fix simulator (change date / quantity / delete, with full delta analysis) arrives in Phase 3.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectedTxnPreview({ ledger, txnId }: { ledger: ReturnType<typeof computeLedger>; txnId: string }) {
  const legs = Object.values(ledger.byLocation)
    .flatMap((l) => l.rows)
    .filter((r) => r.nsTransactionId === txnId);
  if (!legs.length) return <p className="text-sm text-muted-foreground">Transaction not found.</p>;
  const first = legs[0];
  return (
    <div className="text-sm space-y-1">
      <div className="font-medium">{first.docNumber}</div>
      <div className="text-muted-foreground">{first.nsType || first.tranType} · {first.tranDate}</div>
      {legs.map((l) => (
        <div key={l.id} className="flex justify-between gap-2">
          <span className="text-muted-foreground truncate">{l.locationName}</span>
          <span className={`font-mono ${l.signedQty < 0 ? 'text-destructive' : ''}`}>{fmtQty(l.signedQty)}</span>
        </div>
      ))}
    </div>
  );
}
