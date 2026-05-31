'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, History } from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { PageHeader } from '../../../components/qq/page-header';
import { Input } from '../../../components/qq/input';
import { Button } from '../../../components/qq/button';
import { Badge } from '../../../components/qq/badge';
import { EmptyState } from '../../../components/qq/empty-state';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../../../components/qq/table';
import { InvTabs, TierBadge } from '../../../components/inventory/InvTabs';

interface Win {
  itemCode: string;
  itemName: string | null;
  locationNsId: string;
  locationName: string;
  start: string;
  end: string | null;
  minBalance: number;
  durationDays: number;
  buildsDuring: number;
  otherOutboundDuring: number;
  status: 'Ongoing' | 'Closed';
  crossedClosedPeriod: boolean;
  tier: number;
}

const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

const initialParam = (key: string, fallback: string) =>
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get(key) ?? fallback
    : fallback;

export default function NegativesHistoryPage() {
  const router = useRouter();
  const [wins, setWins] = useState<Win[]>([]);
  const [loading, setLoading] = useState(true);

  const [tier, setTier] = useState<'all' | 1 | 2 | 3 | 4>('all');
  const [status, setStatus] = useState<'all' | 'Ongoing' | 'Closed'>('all');
  const [crossed, setCrossed] = useState<'all' | 'yes' | 'no'>('all');
  const [search, setSearch] = useState(() => initialParam('item', ''));
  const [loc, setLoc] = useState(() => initialParam('loc', 'all'));

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/inventory-investigation/negatives-history');
        const json = await res.json().catch(() => ({}));
        if (res.ok) setWins(json.windows ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const locations = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of wins) m.set(w.locationNsId, w.locationName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [wins]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    const rows = wins.filter((w) => {
      if (tier !== 'all' && w.tier !== tier) return false;
      if (status !== 'all' && w.status !== status) return false;
      if (crossed !== 'all' && (crossed === 'yes') !== w.crossedClosedPeriod) return false;
      if (loc !== 'all' && w.locationNsId !== loc) return false;
      if (q && !w.itemCode.toUpperCase().includes(q) && !(w.itemName ?? '').toUpperCase().includes(q)) return false;
      return true;
    });
    // Sort: ongoing T1→T2→T3 (deepest first), then closed crossed-period, then closed normal (longest first).
    const rank = (w: Win) => (w.status === 'Ongoing' ? w.tier : w.crossedClosedPeriod ? 4 : 5);
    rows.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra <= 3) return a.minBalance - b.minBalance; // deepest first
      return b.durationDays - a.durationDays; // longest first
    });
    return rows;
  }, [wins, tier, status, crossed, loc, search]);

  const exportCsv = () => {
    const head = ['Item', 'Item Name', 'Location', 'Start', 'End', 'Duration (d)', 'Depth', 'Tier', 'Status', 'Builds During', 'Other Outbound', 'Crossed Period'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filtered.map((w) =>
      [w.itemCode, w.itemName, w.locationName, w.start, w.end ?? 'ongoing', w.durationDays, w.minBalance, w.tier, w.status, w.buildsDuring, w.otherOutboundDuring, w.crossedClosedPeriod ? 'yes' : 'no']
        .map(esc).join(','),
    );
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'negatives-history.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const openDetail = (w: Win) =>
    router.push(`/admin/inventory-investigation/${encodeURIComponent(w.itemCode)}?loc=${encodeURIComponent(w.locationNsId)}`);

  const tierChips: ('all' | 1 | 2 | 3 | 4)[] = ['all', 1, 2, 3, 4];

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Negatives History"
        description="Every negative window in the cached data, classified by damage tier. What was actually broken, and for how long."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        }
      />
      <InvTabs />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1">
          {tierChips.map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${tier === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-secondary'}`}
            >
              {t === 'all' ? 'All tiers' : t === 1 ? '1 Toxic' : t === 2 ? '2 Compounding' : t === 3 ? '3 Dormant' : '4 Historical'}
            </button>
          ))}
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="all">All status</option>
          <option value="Ongoing">Ongoing only</option>
          <option value="Closed">Closed only</option>
        </select>
        <select value={crossed} onChange={(e) => setCrossed(e.target.value as any)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="all">Crossed period: all</option>
          <option value="yes">Crossed: yes</option>
          <option value="no">Crossed: no</option>
        </select>
        <select value={loc} onChange={(e) => setLoc(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm max-w-[200px]">
          <option value="all">All locations</option>
          {locations.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item…" className="h-9 w-40" />
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} of {wins.length}</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Loading…</p>
      ) : wins.length === 0 ? (
        <EmptyState icon={<History />} title="No history yet" description='Run "Recompute worklist" on the Worklist tab to scan the catalog and build the negatives history.' />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<History />} title="Nothing matches" description="Adjust the filters above." />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Depth</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Builds</TableHead>
                  <TableHead className="text-right">Other out</TableHead>
                  <TableHead>Crossed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((w, i) => (
                  <TableRow key={`${w.itemCode}|${w.locationNsId}|${w.start}|${i}`} className="cursor-pointer" onClick={() => openDetail(w)}>
                    <TableCell className="py-2">
                      <span className="font-medium text-accent hover:underline" title={w.itemName ?? ''}>{w.itemCode}</span>
                    </TableCell>
                    <TableCell className="py-2 text-xs">{w.locationName}</TableCell>
                    <TableCell className="py-2 font-mono text-xs whitespace-nowrap">{w.start}</TableCell>
                    <TableCell className="py-2 font-mono text-xs whitespace-nowrap">{w.end ?? <span className="text-destructive">ongoing</span>}</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs">{w.durationDays}d</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs text-destructive font-semibold">{fmt(w.minBalance)}</TableCell>
                    <TableCell className="py-2"><TierBadge tier={w.tier} /></TableCell>
                    <TableCell className="py-2 text-xs">{w.status === 'Ongoing' ? <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Ongoing</Badge> : <span className="text-muted-foreground">Closed</span>}</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs">{w.buildsDuring || ''}</TableCell>
                    <TableCell className="py-2 text-right font-mono text-xs">{w.otherOutboundDuring || ''}</TableCell>
                    <TableCell className="py-2 text-xs">{w.crossedClosedPeriod ? <span className="text-amber-700">crossed</span> : ''}</TableCell>
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
