'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, Download, ArrowRight, ListChecks } from 'lucide-react';

import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent } from '../../components/qq/card';
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

type Confidence = 'CLEAN' | 'PARTIAL' | 'NONE';
type Status = 'todo' | 'done' | 'skipped';

interface Row {
  itemCode: string;
  itemName: string | null;
  locationNsId: string;
  locationName: string;
  depth: number;
  since: string | null;
  recommendedAction: string;
  suspectNsTransactionId: string | null;
  suspectDoc: string | null;
  suspectType: string | null;
  suspectDate: string | null;
  changeFrom: string | null;
  changeTo: string | null;
  confidence: Confidence;
  notes: string;
  status: Status;
}
interface Meta {
  computedAt: string | null;
  cases: number | null;
  cleanCount: number | null;
  itemsScanned: number | null;
  durationMs: number | null;
}

const ACTION_LABEL: Record<string, string> = {
  REDUCE_QTY: 'Reduce quantity',
  DELETE: 'Delete transaction',
  CHANGE_DATE_FORWARD: 'Change date forward',
  MANUAL_REVIEW: 'Needs manual review',
};

const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function WorklistPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cleanOnly, setCleanOnly] = useState(false);
  const [hideDone, setHideDone] = useState(true);
  const [search, setSearch] = useState('');

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
  }, [load]);

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
    setRows((prev) =>
      prev.map((x) => (x.itemCode === r.itemCode && x.locationNsId === r.locationNsId ? { ...x, status } : x)),
    );
    await fetchWithAuth('/api/inventory-investigation/worklist/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemCode: r.itemCode, locationNsId: r.locationNsId, status }),
    }).catch(() => {});
  };

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return rows.filter((r) => {
      if (cleanOnly && r.confidence !== 'CLEAN') return false;
      if (hideDone && r.status === 'done') return false;
      if (q && !r.itemCode.toUpperCase().includes(q) && !(r.itemName ?? '').toUpperCase().includes(q)) return false;
      return true;
    });
  }, [rows, cleanOnly, hideDone, search]);

  const counts = useMemo(() => {
    const c = { clean: 0, partial: 0, none: 0, done: 0 };
    for (const r of rows) {
      if (r.status === 'done') c.done++;
      if (r.confidence === 'CLEAN') c.clean++;
      else if (r.confidence === 'PARTIAL') c.partial++;
      else c.none++;
    }
    return c;
  }, [rows]);

  const exportCsv = () => {
    const head = [
      'Item', 'Item Name', 'Location', 'Depth', 'Since', 'Recommended Action',
      'Suspect Doc', 'Suspect Type', 'Suspect Date', 'Change From', 'Change To',
      'Confidence', 'Status', 'Notes',
    ];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filtered.map((r) =>
      [r.itemCode, r.itemName, r.locationName, r.depth, r.since, ACTION_LABEL[r.recommendedAction] ?? r.recommendedAction,
        r.suspectDoc, r.suspectType, r.suspectDate, r.changeFrom, r.changeTo, r.confidence, r.status, r.notes]
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
        description="Recommended fixes for every negative-inventory case. Execute them manually in NetSuite — nothing is pushed automatically."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button onClick={recompute} loading={recomputing}>
              <RefreshCw className="h-4 w-4" /> Recompute worklist
            </Button>
          </div>
        }
      />

      {/* Meta + quick item search */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-xs text-muted-foreground">
          {meta?.computedAt
            ? <>Last computed {new Date(meta.computedAt).toLocaleString()} · {counts.clean} clean · {counts.partial} partial · {counts.none} manual{meta.durationMs ? ` · ${(meta.durationMs / 1000).toFixed(0)}s` : ''}</>
            : 'Not computed yet — click “Recompute worklist” (takes ~30s).'}
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

      {/* Toggles */}
      <div className="flex items-center gap-4 mb-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={cleanOnly} onChange={(e) => setCleanOnly(e.target.checked)} />
          CLEAN only (easy wins)
        </label>
        <label className="flex items-center gap-1.5">
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
          description='Click "Recompute worklist" to scan the catalog for negative-inventory cases and generate recommended fixes (~30 seconds).'
          action={<Button onClick={recompute} loading={recomputing}><RefreshCw className="h-4 w-4" /> Recompute worklist</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<ListChecks />} title="Nothing matches" description="Adjust the filters above." />
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
                  <TableHead>Recommended action</TableHead>
                  <TableHead>Transaction to edit</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={`${r.itemCode}|${r.locationNsId}`} className={r.status === 'done' ? 'opacity-50' : ''}>
                    <TableCell className="py-2">
                      <button
                        onClick={() =>
                          router.push(
                            `/admin/inventory-investigation/${encodeURIComponent(r.itemCode)}${r.suspectNsTransactionId ? `?tx=${encodeURIComponent(r.suspectNsTransactionId)}` : ''}`,
                          )
                        }
                        className="font-medium text-accent hover:underline"
                        title={r.itemName ?? ''}
                      >
                        {r.itemCode}
                      </button>
                    </TableCell>
                    <TableCell className="py-2 text-xs">{r.locationName}</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs text-destructive font-semibold">{fmt(r.depth)}</TableCell>
                    <TableCell className="py-2 font-mono text-xs whitespace-nowrap">{r.since ?? ''}</TableCell>
                    <TableCell className="py-2 text-xs whitespace-nowrap">{ACTION_LABEL[r.recommendedAction] ?? r.recommendedAction}</TableCell>
                    <TableCell className="py-2 text-xs whitespace-nowrap">
                      {r.suspectDoc ? (
                        <span title={`${r.suspectType ?? ''} ${r.suspectDate ?? ''}`}>
                          {r.suspectDoc}
                          <span className="text-muted-foreground"> · {r.suspectDate}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="py-2 font-mono text-xs whitespace-nowrap">
                      {r.changeFrom != null ? `${r.changeFrom} → ${r.changeTo}` : ''}
                    </TableCell>
                    <TableCell className="py-2">
                      <ConfidenceBadge c={r.confidence} />
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground max-w-[320px]">{r.notes}</TableCell>
                    <TableCell className="py-2">
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

function ConfidenceBadge({ c }: { c: Confidence }) {
  if (c === 'CLEAN') return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">CLEAN</Badge>;
  if (c === 'PARTIAL') return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">PARTIAL</Badge>;
  return <Badge variant="secondary">MANUAL</Badge>;
}
