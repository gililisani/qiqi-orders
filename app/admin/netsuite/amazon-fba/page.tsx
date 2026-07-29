'use client';

/**
 * Amazon FBA → NetSuite import.
 *
 * Upload the Seller Central "All Transactions" CSV; each calendar month
 * becomes a preview of the NetSuite records to create (Cash Sale, Cash
 * Refund, Vendor Bill + Payment, reimbursement Journal). Push per month —
 * idempotent via AMAZON-FBA-* external IDs + a batch registry.
 */

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, FileUp, Settings2, Trash2, XCircle } from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import type { MonthPreview } from '../../../../lib/amazonFba/parseReport';
import {
  missingConfigFields,
  type AmazonFbaConfig,
} from '../../../../lib/amazonFba/pushToNetSuite';
import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/qq/card';
import { Button } from '../../../components/qq/button';
import { Input } from '../../../components/qq/input';
import { FormField } from '../../../components/qq/form-field';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../../../components/qq/table';
import { useToast } from '../../../components/ui/ToastProvider';
import {
  AmazonFbaSettings,
  type AmazonFbaConfigRow,
} from '../../../components/admin/amazonFba/AmazonFbaSettings';
import { AmazonFbaMonthCard } from '../../../components/admin/amazonFba/AmazonFbaMonthCard';
import { NsItemSearchInput, type NsItem } from '../../../components/admin/amazonFba/NsItemSearchInput';

interface Mapping {
  id: string;
  amazon_name: string;
  ns_item_id: string;
  ns_item_name: string;
  unit_price: number;
}

interface Batch {
  period: string;
  status: string;
  ns_refs: Record<string, { nsId?: string; tranId?: string; status: string }>;
  error?: string | null;
  pushed_by?: string | null;
  created_at?: string;
}

function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function AmazonFbaPage() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previews, setPreviews] = useState<MonthPreview[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [config, setConfig] = useState<AmazonFbaConfigRow | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Map-product modal state
  const [mapModal, setMapModal] = useState<{ amazonName: string; suggestedPrice: number } | null>(null);
  const [mapItem, setMapItem] = useState<NsItem | null>(null);
  const [mapPrice, setMapPrice] = useState('');
  const [savingMap, setSavingMap] = useState(false);

  // Import history — loaded on mount so admins see what's already pushed
  // BEFORE uploading anything (prevents a second admin re-importing a month).
  useEffect(() => {
    loadBatches();
  }, []);

  async function loadBatches() {
    try {
      const res = await fetchWithAuth('/api/netsuite/amazon-fba/batches');
      const data = await res.json();
      if (res.ok) setBatches(data.batches || []);
    } catch {
      // non-fatal — the per-month guard still blocks double pushes
    }
  }

  async function parse(text: string) {
    setParsing(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/netsuite/amazon-fba/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed to parse the file.');
      setPreviews(data.previews || []);
      setMappings(data.mappings || []);
      setBatches(data.batches || []);
      setConfig(data.config);
      if ((data.parseErrors || []).length > 0) {
        toast.error(`${data.parseErrors.length} row(s) could not be read — check the file.`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to parse the file.');
    } finally {
      setParsing(false);
    }
  }

  async function refreshBatches() {
    await loadBatches();
    if (csvText) await parse(csvText);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setCsvText(text);
      parse(text);
    };
    reader.readAsText(file);
  }

  function openMapModal(amazonName: string, suggestedPrice: number) {
    setMapModal({ amazonName, suggestedPrice });
    setMapItem(null);
    setMapPrice(String(suggestedPrice || ''));
  }

  async function saveMapping() {
    if (!mapModal || !mapItem) return;
    setSavingMap(true);
    try {
      const res = await fetchWithAuth('/api/netsuite/amazon-fba/item-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amazon_name: mapModal.amazonName,
          ns_item_id: mapItem.id,
          ns_item_name: mapItem.itemid,
          unit_price: parseFloat(mapPrice),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed to save mapping.');
      toast.success('Product mapped.');
      setMapModal(null);
      if (csvText) await parse(csvText); // re-parse with the new mapping
    } catch (err: any) {
      toast.error(err.message || 'Failed to save mapping.');
    } finally {
      setSavingMap(false);
    }
  }

  async function deleteMapping(id: string) {
    if (!window.confirm('Remove this product mapping?')) return;
    try {
      const res = await fetchWithAuth(`/api/netsuite/amazon-fba/item-map?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete mapping.');
      toast.success('Mapping removed.');
      if (csvText) await parse(csvText);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title="Amazon FBA"
        description="Upload the Amazon All Transactions report and create the month's NetSuite records."
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowSettings((s) => !s)}>
            <Settings2 className="h-4 w-4" />
            {showSettings ? 'Hide settings' : 'Settings'}
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showSettings && config && (
        <AmazonFbaSettings config={config} onConfigChange={setConfig} />
      )}

      {/* Upload */}
      <Card>
        <CardContent className="py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Button onClick={() => fileInputRef.current?.click()} loading={parsing}>
              <FileUp className="h-4 w-4" />
              {csvText ? 'Upload a different file' : 'Upload Amazon CSV'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="hidden"
            />
            {fileName ? (
              <span className="text-sm text-muted-foreground">
                {fileName} — {previews.length} month(s) found
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Seller Central → Payments → Reports repository → All Transactions (CSV). Any date
                range works; each month is pushed separately and can never be double-booked.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Import history — always visible so nobody re-imports a month */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Import history</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing imported yet. Months that get pushed to NetSuite will be listed here for
              every admin to see.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">NetSuite records</TableHead>
                  <TableHead className="hidden sm:table-cell">By</TableHead>
                  <TableHead className="hidden sm:table-cell">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.period}>
                    <TableCell className="text-sm font-medium">{periodLabel(b.period)}</TableCell>
                    <TableCell>
                      {b.status === 'pushed' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                          <BadgeCheck className="h-3.5 w-3.5" /> Pushed
                        </span>
                      ) : b.status === 'failed' ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/5 border border-destructive/30 rounded-full px-2 py-0.5"
                          title={b.error || undefined}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Failed — retry by re-uploading
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">In progress…</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="font-mono text-xs text-muted-foreground">
                        {Object.values(b.ns_refs || {})
                          .map((r) => r.tranId)
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">{b.pushed_by || '—'}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Month cards */}
      {previews.map((preview) => (
        <AmazonFbaMonthCard
          key={preview.period}
          preview={preview}
          batch={batches.find((b) => b.period === preview.period) || null}
          missingConfig={
            config
              ? missingConfigFields(config as AmazonFbaConfig, {
                  period: preview.period,
                  periodLabel: preview.periodLabel,
                  tranDate: preview.tranDate,
                  saleLines: preview.saleLines,
                  discountTotal: preview.discountTotal,
                  refundTotal: preview.refundTotal,
                  feeLines: preview.feeLines,
                  reimbursementTotal: preview.reimbursementTotal,
                })
              : ['Settings not loaded']
          }
          onRequestMapProduct={openMapModal}
          onPushed={refreshBatches}
        />
      ))}

      {/* Product mappings */}
      {csvText && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Product mappings</CardTitle>
          </CardHeader>
          <CardContent>
            {mappings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No products mapped yet — unmapped products in the upload appear under “Needs
                attention” with a map button.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Amazon product</TableHead>
                    <TableHead>NetSuite item</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">{m.amazon_name}</TableCell>
                      <TableCell className="text-sm font-mono">{m.ns_item_name}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        ${Number(m.unit_price).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete mapping"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteMapping(m.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Map-product modal */}
      {mapModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-lg max-w-lg w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold">Map Amazon product</h2>
            <p className="text-sm text-muted-foreground">
              “{mapModal.amazonName}” — pick the NetSuite item it corresponds to and confirm the
              Amazon unit price (used to infer quantities).
            </p>
            <FormField label="NetSuite item" required>
              <NsItemSearchInput selected={mapItem} onSelect={setMapItem} />
            </FormField>
            <FormField label="Amazon unit price (USD)" required>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={mapPrice}
                onChange={(e) => setMapPrice(e.target.value)}
              />
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setMapModal(null)} disabled={savingMap}>
                Cancel
              </Button>
              <Button
                onClick={saveMapping}
                loading={savingMap}
                disabled={!mapItem || !(parseFloat(mapPrice) > 0)}
              >
                Save mapping
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
