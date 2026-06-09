'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, Download, ArrowRight, ListChecks, History, Upload } from 'lucide-react';

import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { PageHeader } from '../../components/qq/page-header';
import { Button } from '../../components/qq/button';
import { Input } from '../../components/qq/input';
import { Badge } from '../../components/qq/badge';
import { EmptyState } from '../../components/qq/empty-state';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../../components/qq/table';
import { InvTabs, TierBadge } from '../../components/inventory/InvTabs';

type Category = 'CLEAN' | 'PARTIAL' | 'MANUAL' | 'CLOSED';
type Status = 'todo' | 'done' | 'skipped';

interface EditStep {
  order: number;
  manual?: boolean;
  doc: string | null;
  docType: string | null;
  action: string;
  detail?: string;
}
interface FixOption {
  label: string;
  recommendationType: string;
  category: Category;
  edits: EditStep[];
  prerequisiteSummary: string;
  notes: string;
}
interface Row {
  itemCode: string;
  itemName: string | null;
  locationNsId: string;
  locationName: string;
  depth: number;
  since: string | null;
  tier: number;
  recommendationType: string;
  category: Category;
  editsRequired: EditStep[];
  prerequisiteSummary: string;
  isBrokenChain: boolean;
  options: FixOption[];
  notes: string;
  suspectNsTransactionId: string | null;
  suspectDoc: string | null;
  suspectType: string | null;
  suspectDate: string | null;
  status: Status;
}
interface Meta {
  computedAt: string | null;
  cases: number | null;
  cleanCount: number | null;
  itemsScanned: number | null;
  durationMs: number | null;
}

// Raw NS type code → label.
const NS_TYPE_LABEL: Record<string, string> = {
  InvTrnfr: 'Inventory Transfer',
  InvAdjst: 'Inventory Adjustment',
  ItemRcpt: 'Item Receipt',
  VendBill: 'Bill',
  ItemShip: 'Item Fulfillment',
  Build: 'Assembly Build',
  TransferOrder: 'Transfer Order',
};

const CHIPS: { key: Category; label: string }[] = [
  { key: 'CLEAN', label: 'Clean' },
  { key: 'PARTIAL', label: 'Partial' },
  { key: 'MANUAL', label: 'Manual review' },
  { key: 'CLOSED', label: 'Closed period' },
];

const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function WorklistPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [active, setActive] = useState<Set<Category>>(new Set<Category>(['CLEAN'])); // default CLEAN only
  const [hideDone, setHideDone] = useState(true);
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('all');

  const [snapshot, setSnapshot] = useState<{ cutoffDate: string | null; rowCount: number; uploadedAt: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cutoffDate, setCutoffDate] = useState('2023-12-31');
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    const res = await fetchWithAuth('/api/inventory-investigation/opening-snapshot');
    const json = await res.json().catch(() => ({}));
    if (res.ok) setSnapshot(json);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/inventory-investigation/worklist');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.rows ?? []);
      setMeta(json.meta ?? null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadSnapshot();
  }, [load, loadSnapshot]);

  const uploadSnapshot = async (file: File) => {
    setUploading(true);
    setUploadMsg(null);
    try {
      const csv = await file.text();
      const res = await fetchWithAuth('/api/inventory-investigation/opening-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoffDate, csv }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Import failed');
      setUploadMsg(`Imported ${json.imported} opening rows as of ${json.cutoffDate}.${json.warningCount ? ` ${json.warningCount} warning(s).` : ''} Click “Refresh All from NetSuite” to apply.`);
      await loadSnapshot();
    } catch (e: any) {
      setUploadMsg(`Import failed: ${e?.message || 'unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const recompute = async () => {
    setRecomputing(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/inventory-investigation/worklist/recompute', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Recompute failed');
      await load();
    } catch (e: any) {
      setError(`${e?.message || 'Recompute failed'} — for a large catalog run "npm run inv:worklist" locally instead.`);
    } finally {
      setRecomputing(false);
    }
  };

  const setStatus = async (r: Row, status: Status) => {
    // Identity is (item, location, since) — a location can have several windows.
    setRows((prev) =>
      prev.map((x) =>
        x.itemCode === r.itemCode && x.locationNsId === r.locationNsId && x.since === r.since
          ? { ...x, status }
          : x,
      ),
    );
    await fetchWithAuth('/api/inventory-investigation/worklist/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemCode: r.itemCode, locationNsId: r.locationNsId, since: r.since, status }),
    }).catch(() => {});
  };

  const toggleChip = (c: Category) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next.size === 0 ? new Set<Category>([c]) : next; // never empty
    });
  };

  const counts = useMemo(() => {
    const c: Record<Category, number> = { CLEAN: 0, PARTIAL: 0, MANUAL: 0, CLOSED: 0 };
    for (const r of rows) c[r.category] = (c[r.category] ?? 0) + 1;
    return c;
  }, [rows]);

  const years = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.since) s.add(r.since.slice(0, 4));
    return [...s].sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return rows.filter((r) => {
      if (!active.has(r.category)) return false;
      if (hideDone && r.status === 'done') return false;
      if (year !== 'all' && (r.since ?? '').slice(0, 4) !== year) return false;
      if (q && !r.itemCode.toUpperCase().includes(q) && !(r.itemName ?? '').toUpperCase().includes(q)) return false;
      return true;
    });
  }, [rows, active, hideDone, year, search]);

  const editsText = (r: Row) =>
    r.editsRequired
      .map((e) => `${e.order}. ${e.manual ? '[NetSuite UI] ' : ''}${e.doc ? e.doc + ' (' + (NS_TYPE_LABEL[e.docType ?? ''] ?? e.docType) + '): ' : ''}${e.action}`)
      .join('  |  ');

  const exportCsv = () => {
    const head = [
      'Item', 'Item Name', 'Location', 'Depth', 'Since', 'Tier', 'Recommendation Type',
      'Edits Required', 'Prerequisite', 'Category', 'Broken Chain', 'Status', 'Notes',
    ];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filtered.map((r) =>
      [r.itemCode, r.itemName, r.locationName, r.depth, r.since, `T${r.tier}`, r.recommendationType,
        editsText(r), r.prerequisiteSummary, r.category, r.isBrokenChain ? 'yes' : '', r.status, r.notes]
        .map(esc).join(','),
    );
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory-worklist.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const goSearch = (e: FormEvent) => {
    e.preventDefault();
    const c = search.trim().toUpperCase();
    if (c) router.push(`/admin/inventory-investigation/${encodeURIComponent(c)}`);
  };

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Inventory Worklist"
        description="Recommended fixes for every negative-inventory case. Only clerical records (transfers, receipts, adjustments, bills) in open periods are ever proposed — execute them manually in NetSuite."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button onClick={recompute} loading={recomputing}>
              <RefreshCw className="h-4 w-4" /> Refresh All from NetSuite
            </Button>
          </div>
        }
      />

      <InvTabs />

      {/* Opening-balance snapshot — anchors balances so they match NetSuite. */}
      <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${snapshot?.cutoffDate ? 'border-border bg-card' : 'border-amber-300 bg-amber-50'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {snapshot?.cutoffDate ? (
              <>
                <span className="font-medium">Opening snapshot active</span>
                <span className="text-muted-foreground">
                  {' '}— {snapshot.rowCount.toLocaleString()} item/location openings as of {snapshot.cutoffDate}
                  {snapshot.uploadedAt ? ` · uploaded ${new Date(snapshot.uploadedAt).toLocaleDateString()}` : ''}
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold text-amber-900">⚠️ No opening snapshot</span>
                <span className="text-amber-900">
                  {' '}— balances run from zero, so items with pre-2024 stock (e.g. FPS0017) won&apos;t match NetSuite.
                  Upload a NetSuite on-hand export (Item · Location · Quantity On Hand) as of the cutoff to anchor them.
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Cutoff</label>
            <input
              type="date"
              value={cutoffDate}
              onChange={(e) => setCutoffDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <label className={`inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-3 text-sm hover:bg-secondary ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload className="h-4 w-4" />
              {uploading ? 'Uploading…' : 'Upload snapshot CSV'}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadSnapshot(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
        {uploadMsg && <div className="mt-2 text-xs text-foreground">{uploadMsg}</div>}
      </div>

      {recomputing && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          <RefreshCw className="h-4 w-4 animate-spin text-accent" />
          <div>
            <div className="font-medium">Re-pulling the full catalog from NetSuite…</div>
            <div className="text-xs text-muted-foreground">
              Fetching every item's inventory history + intercompany chain links, then recomputing all
              recommendations. This takes ~30–60 seconds — you can keep this tab open.
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-xs text-muted-foreground">
          {meta?.computedAt
            ? <>Last computed {new Date(meta.computedAt).toLocaleString()} · {meta.cases} cases{meta.durationMs ? ` · ${(meta.durationMs / 1000).toFixed(0)}s` : ''}</>
            : 'Not computed yet — click “Refresh All from NetSuite” (takes ~30–60s).'}
        </p>
        <form onSubmit={goSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter or open an item…"
              className="pl-8 h-9 w-64"
            />
          </div>
          <Button type="submit" variant="ghost" size="sm" disabled={!search.trim()}>
            Open <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {CHIPS.map((chip) => {
          const on = active.has(chip.key);
          return (
            <button
              key={chip.key}
              onClick={() => toggleChip(chip.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                on ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-secondary'
              }`}
            >
              {chip.label} <span className="opacity-70">{counts[chip.key]}</span>
            </button>
          );
        })}
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm ml-2"
          title="Filter by the year the location went negative"
        >
          <option value="all">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          Hide done
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} shown</span>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title="No worklist yet"
          description='Click "Refresh All from NetSuite" to scan the catalog for negative-inventory cases and generate recommended fixes (~30–60 seconds).'
          action={<Button onClick={recompute} loading={recomputing}><RefreshCw className="h-4 w-4" /> Refresh All from NetSuite</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<ListChecks />} title="Nothing matches" description="Adjust the category chips or filters above." />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Depth</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead className="min-w-[320px]">Edits required</TableHead>
                  <TableHead>Prerequisite</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={`${r.itemCode}|${r.locationNsId}|${r.since}`} className={r.status === 'done' ? 'opacity-50' : ''}>
                    <TableCell className="py-2 align-top">
                      <div className="flex flex-col">
                        <button
                          onClick={() =>
                            router.push(
                              `/admin/inventory-investigation/${encodeURIComponent(r.itemCode)}${r.suspectNsTransactionId ? `?tx=${encodeURIComponent(r.suspectNsTransactionId)}` : `?loc=${encodeURIComponent(r.locationNsId)}`}`,
                            )
                          }
                          className="font-medium text-accent hover:underline text-left"
                          title={r.itemName ?? ''}
                        >
                          {r.itemCode}
                        </button>
                        <button
                          onClick={() =>
                            router.push(
                              `/admin/inventory-investigation/negatives-history?item=${encodeURIComponent(r.itemCode)}&loc=${encodeURIComponent(r.locationNsId)}`,
                            )
                          }
                          className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:underline"
                        >
                          <History className="h-3 w-3" /> history
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-xs align-top">{r.locationName}</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs text-destructive font-semibold align-top">{r.depth ? fmt(r.depth) : ''}</TableCell>
                    <TableCell className="py-2 font-mono text-xs whitespace-nowrap align-top">{r.since ?? ''}</TableCell>
                    <TableCell className="py-2 align-top"><TierBadge tier={r.tier} /></TableCell>
                    <TableCell className="py-2 text-xs whitespace-nowrap align-top">
                      {r.isBrokenChain ? <span className="font-semibold text-destructive">Broken chain</span> : r.recommendationType}
                    </TableCell>
                    <TableCell className="py-2 text-xs align-top">
                      {r.editsRequired.length ? (
                        <ol className="space-y-0.5">
                          {r.editsRequired.map((e) => (
                            <li key={e.order} className="flex gap-1.5">
                              <span className="text-muted-foreground tabular-nums">{e.order}.</span>
                              <span>
                                {e.manual && <span className="mr-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800">NetSuite UI</span>}
                                {e.doc && (
                                  <span className="font-mono font-medium">
                                    {e.manual ? (
                                      e.doc
                                    ) : (
                                      <button
                                        onClick={() => router.push(`/admin/inventory-investigation/document-impact?doc=${encodeURIComponent(e.doc!)}`)}
                                        className="text-accent hover:underline"
                                        title="Analyze this document's full multi-item impact"
                                      >
                                        {e.doc}
                                      </button>
                                    )}
                                    <span className="font-sans font-normal text-muted-foreground"> · {NS_TYPE_LABEL[e.docType ?? ''] ?? e.docType} · </span>
                                  </span>
                                )}
                                {e.action}
                                {e.detail && <span className="block text-[11px] text-muted-foreground">{e.detail}</span>}
                              </span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <span className="text-muted-foreground">{r.isBrokenChain ? 'See notes — manual review' : '—'}</span>
                      )}
                      {r.options.length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-accent">{r.options.length} alternative{r.options.length > 1 ? 's' : ''}</summary>
                          <div className="mt-1 space-y-1 border-l-2 border-border pl-2">
                            {r.options.map((o, i) => (
                              <div key={i} className="text-[11px]">
                                <span className="font-medium">{String.fromCharCode(66 + i)}. [{o.category}] {o.recommendationType}</span>
                                {' '}· prereq {o.prerequisiteSummary} · {o.edits.length} edit{o.edits.length > 1 ? 's' : ''}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      <NoteWithWarning notes={r.notes} />
                    </TableCell>
                    <TableCell className="py-2 text-xs align-top">{r.prerequisiteSummary}</TableCell>
                    <TableCell className="py-2 align-top">
                      <CategoryBadge c={r.category} />
                    </TableCell>
                    <TableCell className="py-2 align-top">
                      <select
                        value={r.status}
                        onChange={(e) => setStatus(r, e.target.value as Status)}
                        className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
                      >
                        <option value="todo">To Do</option>
                        <option value="done">Done</option>
                        <option value="skipped">Skipped</option>
                      </select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryBadge({ c }: { c: Category }) {
  if (c === 'CLEAN') return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">CLEAN</Badge>;
  if (c === 'PARTIAL') return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">PARTIAL</Badge>;
  if (c === 'CLOSED') return <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">CLOSED</Badge>;
  return <Badge variant="secondary">MANUAL</Badge>;
}

const BOUNDARY_WARN_PREFIX = '⚠️ CLOSED-PERIOD BOUNDARY: ';

// Splits the closed-period-boundary warning out of the notes so it can be shown
// with a distinct amber accent (Adjustment 1).
function NoteWithWarning({ notes }: { notes: string }) {
  const idx = notes.indexOf(BOUNDARY_WARN_PREFIX);
  if (idx === -1) return <div className="mt-1 text-[11px] text-muted-foreground">{notes}</div>;
  const base = notes.slice(0, idx).trim();
  const warn = notes.slice(idx + BOUNDARY_WARN_PREFIX.length).trim();
  return (
    <div className="mt-1 space-y-1">
      {base && <div className="text-[11px] text-muted-foreground">{base}</div>}
      <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
        <span className="font-semibold">⚠️ Closed-period boundary — </span>
        {warn}
      </div>
    </div>
  );
}
