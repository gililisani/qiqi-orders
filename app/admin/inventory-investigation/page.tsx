'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search, Download, ArrowRight, ListChecks } from 'lucide-react';

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

type Category = 'CLEAN' | 'PARTIAL' | 'MANUAL' | 'CLOSED';
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
  suspectType: string | null; // raw NS type code
  suspectDate: string | null;
  changeFrom: string | null;
  changeTo: string | null;
  category: Category;
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
  CHANGE_DATE_EARLIER: 'Change date earlier',
  MANUAL_REVIEW: 'Needs manual review',
  CLOSED_PERIOD: 'Out of scope — closed period',
};

// Raw NS type code → label (only the editable types ever appear as a target).
const NS_TYPE_LABEL: Record<string, string> = {
  InvTrnfr: 'Inventory Transfer',
  InvAdjst: 'Inventory Adjustment',
  ItemRcpt: 'Item Receipt',
  VendBill: 'Bill',
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

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return rows.filter((r) => {
      if (!active.has(r.category)) return false;
      if (hideDone && r.status === 'done') return false;
      if (q && !r.itemCode.toUpperCase().includes(q) && !(r.itemName ?? '').toUpperCase().includes(q)) return false;
      return true;
    });
  }, [rows, active, hideDone, search]);

  const exportCsv = () => {
    const head = [
      'Item', 'Item Name', 'Location', 'Depth', 'Since', 'Recommended Action',
      'Transaction To Edit', 'Type', 'Tx Date', 'Change From', 'Change To',
      'Category', 'Status', 'Notes',
    ];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filtered.map((r) =>
      [r.itemCode, r.itemName, r.locationName, r.depth, r.since, ACTION_LABEL[r.recommendedAction] ?? r.recommendedAction,
        r.suspectDoc, r.suspectType ? NS_TYPE_LABEL[r.suspectType] ?? r.suspectType : '', r.suspectDate,
        r.changeFrom, r.changeTo, r.category, r.status, r.notes]
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
              <RefreshCw className="h-4 w-4" /> Recompute worklist
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-xs text-muted-foreground">
          {meta?.computedAt
            ? <>Last computed {new Date(meta.computedAt).toLocaleString()} · {meta.cases} cases{meta.durationMs ? ` · ${(meta.durationMs / 1000).toFixed(0)}s` : ''}</>
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
        <label className="flex items-center gap-1.5 text-sm ml-2">
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
                  <TableHead>Recommended action</TableHead>
                  <TableHead>Transaction to edit</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Category</TableHead>
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
                        <span className="font-mono">
                          {r.suspectDoc}
                          <span className="text-muted-foreground font-sans">
                            {' · '}{r.suspectType ? NS_TYPE_LABEL[r.suspectType] ?? r.suspectType : '?'}{' · '}{r.suspectDate}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 font-mono text-xs whitespace-nowrap">
                      {r.changeFrom != null ? `${r.changeFrom} → ${r.changeTo}` : ''}
                    </TableCell>
                    <TableCell className="py-2">
                      <CategoryBadge c={r.category} />
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

function CategoryBadge({ c }: { c: Category }) {
  if (c === 'CLEAN') return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">CLEAN</Badge>;
  if (c === 'PARTIAL') return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">PARTIAL</Badge>;
  if (c === 'CLOSED') return <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">CLOSED</Badge>;
  return <Badge variant="secondary">MANUAL</Badge>;
}
