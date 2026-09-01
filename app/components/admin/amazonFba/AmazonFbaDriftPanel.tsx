'use client';

/**
 * Stock drift: NetSuite's Amazon-FBA-location book stock vs Amazon's live
 * inventory, per SKU. Catches unrecorded inbound shipments, never-restocked
 * returns, and phantom stock (delisted SKUs) BEFORE the monthly push fails.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/qq/card';
import { Button } from '../../../components/qq/button';
import type { DriftRow } from '../../../api/netsuite/amazon-fba/drift/route';

const NOTE_LABEL: Record<DriftRow['note'], string> = {
  ok: 'In sync',
  'ns-missing-stock': 'NetSuite is missing stock — unrecorded shipment to Amazon, or returns',
  'ns-phantom-stock': 'NetSuite has stock Amazon doesn’t — removal/disposal never recorded?',
  'unmapped-amazon-sku': 'Amazon SKU not mapped to a NetSuite item',
};

export function AmazonFbaDriftPanel() {
  const [rows, setRows] = useState<DriftRow[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/netsuite/amazon-fba/drift');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Drift check failed.');
      setRows(data.rows || []);
      setGeneratedAt(data.generatedAt || null);
    } catch (err: any) {
      setError(err.message || 'Drift check failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const drifted = (rows || []).filter((r) => r.delta !== 0);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Stock drift — NetSuite vs Amazon (live)
        </CardTitle>
        <Button variant="outline" size="sm" onClick={load} loading={loading}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {!error && rows === null && (
          <p className="text-sm text-muted-foreground">Comparing NetSuite with Amazon…</p>
        )}
        {!error && rows !== null && drifted.length === 0 && (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Every SKU is in sync — NetSuite&apos;s Amazon FBA location matches Amazon&apos;s live stock.
          </div>
        )}
        {!error && rows !== null && drifted.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {drifted.length} SKU(s) out of sync. Positive Δ means NetSuite is missing stock (record
            the inbound shipment / returns); negative Δ means NetSuite carries stock Amazon
            doesn&apos;t have.
          </div>
        )}
        {!error && rows !== null && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Product</th>
                  <th className="py-2 px-3 font-medium text-right">NetSuite</th>
                  <th className="py-2 px-3 font-medium text-right" title="fulfillable + reserved + inbound">
                    Amazon sellable
                  </th>
                  <th className="py-2 px-3 font-medium text-right">Unsellable</th>
                  <th className="py-2 px-3 font-medium text-right">Δ</th>
                  <th className="py-2 pl-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.sku}
                    className={`border-b border-border/60 ${r.delta !== 0 ? 'bg-amber-50/60' : ''}`}
                  >
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs">{r.sku}</span>
                      <span className="text-muted-foreground"> · {r.itemName}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{r.nsQty}</td>
                    <td
                      className="py-2 px-3 text-right font-mono"
                      title={`fulfillable ${r.amazonFulfillable} + reserved ${r.amazonReserved} + inbound ${r.amazonInbound}`}
                    >
                      {r.amazonSellableTotal}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                      {r.amazonUnsellable || 0}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono font-semibold ${
                        r.delta === 0 ? 'text-green-700' : 'text-amber-700'
                      }`}
                    >
                      {r.delta > 0 ? `+${r.delta}` : r.delta}
                    </td>
                    <td className="py-2 pl-3 text-xs text-muted-foreground">{NOTE_LABEL[r.note]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {generatedAt && (
          <p className="text-xs text-muted-foreground">
            Live from Amazon &amp; NetSuite at {new Date(generatedAt).toLocaleString()}. Unsellable
            units (damaged returns awaiting disposal) are deliberately not in NetSuite.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
