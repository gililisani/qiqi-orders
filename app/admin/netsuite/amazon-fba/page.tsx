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
import { BadgeCheck, CloudDownload, FileUp, Settings2, Trash2, XCircle } from 'lucide-react';

import { supabase } from '../../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { amazonFbaRecordUrl } from '../../../../lib/netsuiteUrls';
import type { MonthPreview } from '../../../../lib/amazonFba/parseReport';
import { normalizeStoredPreview } from '../../../../lib/amazonFba/normalizeStoredPreview';
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
  source?: string;
  payload?: MonthPreview | null;
  ns_refs: Record<string, { nsId?: string; tranId?: string; status: string }>;
  audit?: {
    verified_at: string;
    verified_by_name?: string;
    all_green: boolean;
  } | null;
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

interface CatalogProduct {
  id: number;
  item_name: string;
  netsuite_name: string | null;
  sku: string | null;
}

/** Best-guess catalog match for an Amazon product name (shared word tokens). */
function guessCatalogMatch(amazonName: string, products: CatalogProduct[]): CatalogProduct | null {
  const tokens = new Set(
    amazonName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2)
  );
  let best: CatalogProduct | null = null;
  let bestScore = 0;
  for (const p of products) {
    const hay = `${p.item_name} ${p.netsuite_name || ''}`.toLowerCase();
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 2 ? best : null;
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

  // Fetch-from-Amazon state
  const [fetchPeriod, setFetchPeriod] = useState('');
  const [fetching, setFetching] = useState(false);

  // Map-product modal state
  const [mapModal, setMapModal] = useState<{ amazonName: string; suggestedPrice: number } | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [mapProductId, setMapProductId] = useState<string>(''); // Hub catalog pick
  const [useNsSearch, setUseNsSearch] = useState(false); // fallback path
  const [mapItem, setMapItem] = useState<NsItem | null>(null);
  const [mapPrice, setMapPrice] = useState('');
  const [savingMap, setSavingMap] = useState(false);

  // Hub catalog — the primary mapping source (products carry the exact
  // NetSuite name + SKU; the server resolves SKU → NS internal id).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('Products')
        .select('id, item_name, netsuite_name, sku')
        .order('item_name');
      setCatalog((data || []) as CatalogProduct[]);
    })();
  }, []);

  // Loaded on mount: import history (so admins see what's already pushed) and
  // the NetSuite ID config (needed to enable pushing API-prepared months —
  // previously it only arrived with a CSV parse).
  useEffect(() => {
    loadBatches();
    (async () => {
      try {
        const res = await fetchWithAuth('/api/netsuite/amazon-fba/config');
        const data = await res.json();
        if (res.ok && data.config) setConfig(data.config);
      } catch {
        // settings panel + push guard will surface any real config problem
      }
    })();
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

  async function fetchMonthFromAmazon(period: string) {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      setError('Pick a month first.');
      return;
    }
    setFetching(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/netsuite/amazon-fba/fetch-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch from Amazon.');
      toast.success(`${period} fetched from Amazon.`);
      await loadBatches(); // prepared batch now carries the preview
    } catch (err: any) {
      setError(err.message || 'Failed to fetch from Amazon.');
    } finally {
      setFetching(false);
    }
  }

  // API-prepared months render as month cards too (unless a CSV upload
  // provides the same period — the freshly parsed CSV wins the display).
  const csvPeriods = new Set(previews.map((p) => p.period));
  const preparedPreviews = batches
    .filter((b) => b.status !== 'pushed' && b.source === 'api' && !csvPeriods.has(b.period))
    .map((b) => normalizeStoredPreview(b.payload))
    .filter((p): p is MonthPreview => p !== null)
    .sort((a, b) => a.period.localeCompare(b.period));
  const allPreviews = [...previews, ...preparedPreviews];

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
    setUseNsSearch(false);
    setMapPrice(String(suggestedPrice || ''));
    const guess = guessCatalogMatch(amazonName, catalog);
    setMapProductId(guess ? String(guess.id) : '');
  }

  async function saveMapping() {
    if (!mapModal) return;
    const product = catalog.find((p) => String(p.id) === mapProductId);
    if (!useNsSearch && product && !product.sku) {
      toast.error(`"${product.item_name}" has no SKU in the catalog — fix the product first or use direct NetSuite search.`);
      return;
    }
    setSavingMap(true);
    try {
      const payload = useNsSearch
        ? { ns_item_id: mapItem?.id, ns_item_name: mapItem?.itemid }
        : { sku: product?.sku, ns_item_name: product?.netsuite_name || product?.item_name };
      const res = await fetchWithAuth('/api/netsuite/amazon-fba/item-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amazon_name: mapModal.amazonName,
          unit_price: parseFloat(mapPrice),
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed to save mapping.');
      toast.success('Product mapped.');
      setMapModal(null);
      if (csvText) await parse(csvText); // re-parse with the new mapping
      // Re-resolve any API-prepared months so the new mapping takes effect there too.
      const preparedPeriods = batches
        .filter((b) => b.status !== 'pushed' && b.source === 'api' && b.payload?.period)
        .map((b) => b.period);
      for (const period of preparedPeriods) {
        await fetchWithAuth('/api/netsuite/amazon-fba/fetch-month', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ period }),
        });
      }
      if (preparedPeriods.length > 0) await loadBatches();
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

      {/* Get data: fetch from Amazon (primary) or upload a CSV (fallback) */}
      <Card>
        <CardContent className="py-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Input
              type="month"
              value={fetchPeriod}
              onChange={(e) => setFetchPeriod(e.target.value)}
              className="w-full sm:w-44"
            />
            <Button onClick={() => fetchMonthFromAmazon(fetchPeriod)} loading={fetching}>
              <CloudDownload className="h-4 w-4" />
              Fetch from Amazon
            </Button>
            <span className="text-sm text-muted-foreground">
              Pulls the month straight from the Amazon API — exact SKUs and quantities, no file
              needed. The monthly job does this automatically on the 2nd.
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 border-t border-border pt-4">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} loading={parsing}>
              <FileUp className="h-4 w-4" />
              {csvText ? 'Upload a different CSV' : 'Upload CSV instead'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="hidden"
            />
            <span className="text-sm text-muted-foreground">
              {fileName
                ? `${fileName} — ${previews.length} month(s) found`
                : 'Fallback: the All Transactions CSV from Seller Central still works as before.'}
            </span>
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
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                            <BadgeCheck className="h-3.5 w-3.5" /> Pushed
                          </span>
                          {b.audit && (
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 border ${
                                b.audit.all_green
                                  ? 'text-green-700 bg-green-50 border-green-200'
                                  : 'text-amber-700 bg-amber-50 border-amber-300'
                              }`}
                              title={`CSV verification by ${b.audit.verified_by_name || 'admin'} on ${new Date(b.audit.verified_at).toLocaleString()}`}
                            >
                              {b.audit.all_green ? 'CSV verified ✓' : 'CSV verified — deltas'}
                              <span className="opacity-70">
                                {new Date(b.audit.verified_at).toLocaleDateString()}
                              </span>
                            </span>
                          )}
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
                        {(() => {
                          const refs = Object.entries(b.ns_refs || {}).filter(([, r]) => r.tranId);
                          if (refs.length === 0) return '—';
                          return refs.map(([step, r], i) => {
                            const url = amazonFbaRecordUrl(step, r.nsId);
                            return (
                              <span key={step}>
                                {i > 0 && ' · '}
                                {url ? (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline underline-offset-2 hover:text-foreground"
                                  >
                                    {r.tranId}
                                  </a>
                                ) : (
                                  r.tranId
                                )}
                              </span>
                            );
                          });
                        })()}
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
      {allPreviews.map((preview) => (
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
      {(csvText || allPreviews.length > 0) && (
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
              “{mapModal.amazonName}” — pick the catalog product it corresponds to and confirm the
              Amazon unit price (used to infer quantities). Remembered forever; if Amazon renames
              the product it will simply show up here once more.
            </p>
            {!useNsSearch ? (
              <FormField label="Product (NetSuite name from the catalog)" required>
                <select
                  value={mapProductId}
                  onChange={(e) => setMapProductId(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— choose a product —</option>
                  {catalog.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.netsuite_name || p.item_name}{p.sku ? ` (${p.sku})` : ''}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : (
              <FormField label="NetSuite item (direct search)" required>
                <NsItemSearchInput selected={mapItem} onSelect={setMapItem} />
              </FormField>
            )}
            <button
              type="button"
              onClick={() => setUseNsSearch((v) => !v)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {useNsSearch
                ? 'Back to the catalog list'
                : 'Not in the catalog? Search NetSuite directly'}
            </button>
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
                disabled={
                  (useNsSearch ? !mapItem : !mapProductId) || !(parseFloat(mapPrice) > 0)
                }
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
