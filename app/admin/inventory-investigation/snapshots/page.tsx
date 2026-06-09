'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Check, Trash2, Camera } from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { PageHeader } from '../../../components/qq/page-header';
import { Button } from '../../../components/qq/button';
import { Input } from '../../../components/qq/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../../../components/qq/table';
import { InvTabs } from '../../../components/inventory/InvTabs';

interface SnapInfo {
  asOfDate: string;
  rowCount: number;
  capturedAt: string | null;
}

// Suggested anchors: end of 2023 (opening into 2024) + every month-end through
// the current YTD. Denser anchors = less reconstruction drift between them.
function suggestedDates(): string[] {
  const out = ['2023-12-31'];
  // 2024-01 .. 2026-12, capped at "today" by the caller's filter below.
  for (let y = 2024; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      // last day of month m (m is 1-based); day 0 of next month.
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      out.push(`${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`);
    }
  }
  return out;
}

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default function SnapshotsPage() {
  const [captured, setCaptured] = useState<SnapInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithAuth('/api/inventory-investigation/snapshots');
    const json = await res.json().catch(() => ({}));
    if (res.ok) setCaptured(json.dates ?? []);
    else setError(json.error ?? 'Failed to load');
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const capturedByDate = useMemo(() => {
    const m = new Map<string, SnapInfo>();
    for (const s of captured) m.set(s.asOfDate, s);
    return m;
  }, [captured]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const rows = useMemo(() => {
    // Suggested month-ends up to today, plus any captured dates not in the list
    // (e.g. custom captures), newest first.
    const set = new Set(suggestedDates().filter((d) => d <= todayIso));
    for (const s of captured) set.add(s.asOfDate);
    return [...set].sort((a, b) => (a < b ? 1 : -1));
  }, [captured, todayIso]);

  const capture = async (asOfDate: string) => {
    setBusyDate(asOfDate);
    setMsg(null);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/inventory-investigation/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asOfDate }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Capture failed');
      setMsg(`Captured ${fmtDate(asOfDate)}: ${json.count} rows (${json.negatives} negative). Verify these match the report before relying on it.`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyDate(null);
    }
  };

  const remove = async (asOfDate: string) => {
    if (!confirm(`Delete the captured snapshot for ${fmtDate(asOfDate)}?`)) return;
    setBusyDate(asOfDate);
    try {
      const res = await fetchWithAuth(`/api/inventory-investigation/snapshots?date=${asOfDate}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Delete failed');
      }
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyDate(null);
    }
  };

  return (
    <div className="px-6 py-8">
      <PageHeader title="Trusted snapshots" description="Capture the NetSuite report's on-hand at past dates to anchor history accurately." />
      <InvTabs />

      <div className="mb-5 rounded-md border border-border bg-card px-4 py-3 text-sm">
        <p className="font-medium mb-1">How to capture a date</p>
        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
          <li>In NetSuite, open the <strong>Qiqi ALL Stock Matrix</strong> report.</li>
          <li>Set the footer <strong>“As of”</strong> date to the date you want, click <strong>Refresh</strong>, and save.</li>
          <li>Come back here and click <strong>Capture</strong> on that date. We fetch the report exactly as it stands and store it.</li>
        </ol>
        <p className="mt-2 text-xs text-amber-700">
          ⚠️ The feed carries no date of its own — we trust the date you pick here matches what the report is set to. The
          captured negative count is shown so you can sanity-check. When done, set the report back to <strong>Today</strong>.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Start with <strong>2023-12-31</strong> (the opening into 2024) and recent months, then fill in the rest. More
          dates = more accurate history. After capturing, hit “Refresh All from NetSuite” on the Worklist to apply them.
        </p>
      </div>

      <div className="mb-4 flex items-end gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Capture a custom date</label>
          <Input type="date" value={customDate} max={todayIso} onChange={(e) => setCustomDate(e.target.value)} className="h-9 w-44" />
        </div>
        <Button
          onClick={() => customDate && capture(customDate)}
          disabled={!customDate || busyDate === customDate}
          loading={busyDate === customDate}
        >
          <Camera className="h-4 w-4" /> Capture
        </Button>
        <Button variant="secondary" onClick={load} className="ml-auto">
          <RefreshCw className="h-4 w-4" /> Reload
        </Button>
      </div>

      {msg && <div className="mb-4 rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">{msg}</div>}
      {error && <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">{error}</div>}

      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>As-of date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead>Captured</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : (
              rows.map((d) => {
                const snap = capturedByDate.get(d);
                return (
                  <TableRow key={d}>
                    <TableCell className="font-mono text-xs">{fmtDate(d)}</TableCell>
                    <TableCell>
                      {snap ? (
                        <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium"><Check className="h-3.5 w-3.5" /> Captured</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not captured</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{snap?.rowCount ?? ''}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {snap?.capturedAt ? new Date(snap.capturedAt).toLocaleString() : ''}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button size="sm" variant={snap ? 'secondary' : 'default'} onClick={() => capture(d)} loading={busyDate === d} disabled={busyDate === d}>
                          <Camera className="h-3.5 w-3.5" /> {snap ? 'Recapture' : 'Capture'}
                        </Button>
                        {snap && (
                          <Button size="sm" variant="ghost" onClick={() => remove(d)} disabled={busyDate === d} title="Delete this snapshot">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
