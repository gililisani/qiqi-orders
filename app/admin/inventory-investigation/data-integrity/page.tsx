'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, ShieldAlert } from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { PageHeader } from '../../../components/qq/page-header';
import { Input } from '../../../components/qq/input';
import { Button } from '../../../components/qq/button';
import { EmptyState } from '../../../components/qq/empty-state';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../../../components/qq/table';
import { InvTabs } from '../../../components/inventory/InvTabs';

interface Residual {
  itemCode: string;
  itemName: string | null;
  locationNsId: string;
  locationName: string;
  currentQoh: number;
  txSum: number;
  residual: number;
}

const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function DataIntegrityPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Residual[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [loc, setLoc] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/inventory-investigation/data-integrity');
        const json = await res.json().catch(() => ({}));
        if (res.ok) setRows(json.residuals ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const locations = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.locationNsId, r.locationName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return rows
      .filter((r) => {
        if (loc !== 'all' && r.locationNsId !== loc) return false;
        if (q && !r.itemCode.toUpperCase().includes(q) && !(r.itemName ?? '').toUpperCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));
  }, [rows, search, loc]);

  const totalAbs = useMemo(() => filtered.reduce((s, r) => s + Math.abs(r.residual), 0), [filtered]);

  const exportCsv = () => {
    const head = ['Item', 'Item Name', 'Location', 'NS On-Hand', 'Transaction Sum', 'Unexplained Residual'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filtered.map((r) =>
      [r.itemCode, r.itemName, r.locationName, r.currentQoh, r.txSum, r.residual].map(esc).join(','),
    );
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory-data-integrity.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Data Integrity"
        description="Items where NetSuite's current on-hand can't be explained by its visible transaction history — a pre-history or migration artifact. These aren't fixable by editing transactions; they likely need a catch-up inventory adjustment."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        }
      />
      <InvTabs />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={loc} onChange={(e) => setLoc(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm max-w-[220px]">
          <option value="all">All locations</option>
          {locations.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item…" className="h-9 w-40" />
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} location{filtered.length === 1 ? '' : 's'} · {fmt(totalAbs)} units unexplained total
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert />}
          title="No data-integrity issues"
          description="Every item's NetSuite on-hand reconciles to its transaction history. (Run “Refresh All from NetSuite” on the Worklist tab if this looks empty unexpectedly.)"
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<ShieldAlert />} title="Nothing matches" description="Adjust the filters above." />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">NS on-hand</TableHead>
                  <TableHead className="text-right">Transaction sum</TableHead>
                  <TableHead className="text-right">Unexplained</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={`${r.itemCode}|${r.locationNsId}`}>
                    <TableCell className="py-2">
                      <button
                        onClick={() => router.push(`/admin/inventory-investigation/${encodeURIComponent(r.itemCode)}?loc=${encodeURIComponent(r.locationNsId)}`)}
                        className="font-medium text-accent hover:underline"
                        title={r.itemName ?? ''}
                      >
                        {r.itemCode}
                      </button>
                    </TableCell>
                    <TableCell className="py-2 text-xs">{r.locationName}</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs">{fmt(r.currentQoh)}</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs">{fmt(r.txSum)}</TableCell>
                    <TableCell className={`py-2 text-right font-mono text-xs font-semibold ${r.residual < 0 ? 'text-destructive' : 'text-amber-700'}`}>
                      {r.residual > 0 ? '+' : ''}{fmt(r.residual)}
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
