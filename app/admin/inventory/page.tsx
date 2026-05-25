'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Settings } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { formatNumber } from '../../../lib/formatters';
import { useToast } from '../../components/ui/ToastProvider';
import { PageHeader } from '../../components/qq/page-header';
import { Button } from '../../components/qq/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/qq/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/qq/table';
import { Skeleton } from '../../components/qq/skeleton';

interface Location {
  id: string;
  location_name: string;
  netsuite_id: string | null;
}

interface InventoryItem {
  quantity_on_hand: number;
  quantity_available: number;
  synced_at: string;
  product: { id: number; sku: string; item_name: string } | null;
}

export default function InventorySyncPage() {
  const toast = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [search, setSearch] = useState('');
  const [lastSyncSummary, setLastSyncSummary] = useState<{
    matched: number;
    total: number;
    unmatched: number;
    unmatchedSample: string[];
  } | null>(null);

  useEffect(() => {
    supabase
      .from('Locations')
      .select('id, location_name, netsuite_id')
      .order('location_name')
      .then(({ data }) => {
        setLocations(data || []);
        setLocationsLoading(false);
      });
  }, []);

  const loadInventory = useCallback(async (locationId: string) => {
    if (!locationId) return;
    setLoadingInventory(true);
    try {
      const res = await fetchWithAuth(
        `/api/netsuite/sync-inventory?locationId=${locationId}`,
      );
      if (res.ok) {
        const data = await res.json();
        setInventory(data.items || []);
      }
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  const handleLocationChange = (id: string) => {
    setSelectedLocationId(id);
    setInventory([]);
    setLastSyncSummary(null);
    if (id) loadInventory(id);
  };

  const handleSync = async () => {
    if (!selectedLocationId) return;
    setSyncing(true);
    try {
      const res = await fetchWithAuth('/api/netsuite/sync-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: selectedLocationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      toast.success(data.message || 'Inventory synced from NetSuite.');
      setLastSyncSummary({
        matched: data.updated ?? 0,
        total: data.total ?? 0,
        unmatched: data.unmatched ?? 0,
        unmatchedSample: data.unmatchedSample ?? [],
      });
      await loadInventory(selectedLocationId);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);
  const lastSync = inventory[0]?.synced_at
    ? new Date(inventory[0].synced_at).toLocaleString()
    : null;

  const filteredInventory = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return inventory;
    return inventory.filter(
      (i) =>
        i.product?.sku?.toLowerCase().includes(term) ||
        i.product?.item_name?.toLowerCase().includes(term),
    );
  }, [inventory, search]);

  const locationsWithoutNsId = locations.filter((l) => !l.netsuite_id);
  const noLocationsConfigured =
    !locationsLoading && locations.length > 0 && locations.every((l) => !l.netsuite_id);

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Inventory Sync"
        description="Pull on-hand and available quantities from NetSuite, by location."
        breadcrumbs={
          <Link
            href="/admin/netsuite"
            className="text-muted-foreground hover:text-foreground"
          >
            ← NetSuite
          </Link>
        }
      />

      {noLocationsConfigured && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                None of your locations have a NetSuite ID set.
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Inventory sync needs each Location to be linked to its NetSuite
                location ID. Open a location and fill in the{' '}
                <span className="font-mono">NetSuite ID</span> field.
              </p>
              <Link
                href="/admin/locations"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-900 hover:underline"
              >
                <Settings className="h-3 w-3" /> Open Locations admin
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px] max-w-sm">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Location
              </label>
              <select
                value={selectedLocationId}
                onChange={(e) => handleLocationChange(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                disabled={locationsLoading}
              >
                <option value="">Select a location…</option>
                {locations.map((loc) => (
                  <option
                    key={loc.id}
                    value={loc.id}
                    disabled={!loc.netsuite_id}
                  >
                    {loc.location_name}
                    {!loc.netsuite_id ? ' — no NetSuite ID' : ''}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleSync}
              disabled={
                !selectedLocationId || !selectedLocation?.netsuite_id || syncing
              }
            >
              <RefreshCw
                className={syncing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
              />
              {syncing ? 'Syncing from NetSuite…' : 'Sync Now'}
            </Button>
            {locationsWithoutNsId.length > 0 && !noLocationsConfigured && (
              <Link
                href="/admin/locations"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 ml-auto"
              >
                <Settings className="h-3 w-3" />
                {locationsWithoutNsId.length} location
                {locationsWithoutNsId.length === 1 ? '' : 's'} missing NS ID
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {lastSyncSummary && lastSyncSummary.unmatched > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <span className="font-medium">
                {lastSyncSummary.unmatched} of {lastSyncSummary.total}
              </span>{' '}
              NetSuite items had no matching Hub product (SKU drift or items
              not in catalog).{' '}
              {lastSyncSummary.unmatchedSample.length > 0 && (
                <>
                  Sample:{' '}
                  <span className="font-mono">
                    {lastSyncSummary.unmatchedSample.join(', ')}
                  </span>
                  {lastSyncSummary.unmatched >
                    lastSyncSummary.unmatchedSample.length && '…'}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedLocationId && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2 gap-3 flex-wrap">
            <div>
              <CardTitle>Inventory levels</CardTitle>
              {lastSync && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last synced: {lastSync}
                </p>
              )}
            </div>
            {inventory.length > 0 && (
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SKU or product…"
                className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground w-56"
              />
            )}
          </CardHeader>
          <CardContent className="p-0">
            {loadingInventory ? (
              <div className="p-6 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : inventory.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No inventory cached for this location yet. Click{' '}
                <span className="font-medium text-foreground">Sync Now</span> to
                pull from NetSuite.
              </div>
            ) : filteredInventory.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No items match “{search}”.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">
                        {item.product?.sku ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.product?.item_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatNumber(item.quantity_on_hand)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatNumber(item.quantity_available)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
