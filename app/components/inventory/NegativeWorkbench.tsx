'use client';

import { useMemo } from 'react';
import { AlertTriangle, Wrench } from 'lucide-react';
import type { Ledger } from '../../../lib/inventory/balanceEngine';
import { analyzeLaneWindows, type AnalyzedTxn, type WindowAnalysis } from '../../../lib/inventory/windowAnalysis';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../qq/table';

interface Props {
  ledger: Ledger;
  snapshotsApplied: boolean;
  selectedTxnId: string | null;
  onSelectTxn: (nsTransactionId: string) => void;
}

const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

type Row = { role: 'cause' | 'stopped'; t: AnalyzedTxn };

function StatusChip({ t }: { t: AnalyzedTxn }) {
  if (t.fromTO)
    return <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800" title={t.note}>editable · from TO</span>;
  if (t.editable)
    return <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800" title={t.note}>editable</span>;
  if (t.nsTypeCode === 'ItemShip')
    return <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-800" title={t.note}>client shipment · oversold</span>;
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600" title={t.note}>not editable</span>;
}

function WindowBlock({
  locationName,
  w,
  defaultOpen,
  snapshotsApplied,
  selectedTxnId,
  onSelectTxn,
}: {
  locationName: string;
  w: WindowAnalysis;
  defaultOpen: boolean;
  snapshotsApplied: boolean;
  selectedTxnId: string | null;
  onSelectTxn: (id: string) => void;
}) {
  const rows: Row[] = [
    ...w.causedBy.map((t) => ({ role: 'cause' as const, t })),
    ...w.stoppedBy.map((t) => ({ role: 'stopped' as const, t })),
  ];

  return (
    <details open={defaultOpen} className="rounded-lg border border-border">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm marker:text-muted-foreground">
        <span className="font-medium">{locationName}</span>
        <span className="font-mono text-xs font-semibold text-destructive">{fmt(w.depth)}</span>
        <span className="text-xs text-muted-foreground">
          {fmtDate(w.start)} → {w.end ? fmtDate(w.end) : 'ongoing'} · {w.durationDays}d
        </span>
        {w.end === null && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">ongoing</span>}
        {snapshotsApplied && w.unreconciled && (
          <span className="inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-800" title="Overlaps a span NetSuite couldn't reconcile against a trusted snapshot — approximate. Capture a snapshot inside it to verify.">
            <AlertTriangle className="h-3 w-3" /> approximate
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {w.causedBy.length} cause · {w.stoppedBy.length} replenish
        </span>
      </summary>

      <div className="overflow-x-auto border-t border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Role</TableHead>
              <TableHead className="text-right w-24">Change</TableHead>
              <TableHead>Document</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="w-28">Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ role, t }) => (
              <TableRow key={`${role}-${t.id}`} className={t.nsTransactionId === selectedTxnId ? 'bg-accent/5' : ''}>
                <TableCell className="py-1.5">
                  {role === 'cause' ? (
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">Caused ↓</span>
                  ) : (
                    <span className="rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-700">Stopped ↑</span>
                  )}
                </TableCell>
                <TableCell className={`py-1.5 text-right font-mono text-xs font-semibold ${t.qty < 0 ? 'text-destructive' : 'text-green-700'}`}>
                  {t.qty > 0 ? '+' : ''}{fmt(t.qty)}
                </TableCell>
                <TableCell className="py-1.5 font-mono text-xs font-medium">{t.doc || '(no doc)'}</TableCell>
                <TableCell className="py-1.5 text-xs whitespace-nowrap">{t.typeLabel}</TableCell>
                <TableCell className="py-1.5 font-mono text-xs whitespace-nowrap">{fmtDate(t.date)}</TableCell>
                <TableCell className="py-1.5"><StatusChip t={t} /></TableCell>
                <TableCell className="py-1.5 text-right">
                  {t.editable && (
                    <button
                      onClick={() => onSelectTxn(t.nsTransactionId)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-secondary"
                      title="Load into the Fix Simulator below"
                    >
                      <Wrench className="h-3 w-3" /> What if
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}

export function NegativeWorkbench({ ledger, snapshotsApplied, selectedTxnId, onSelectTxn }: Props) {
  const windows = useMemo(() => {
    const out: { locationName: string; w: WindowAnalysis }[] = [];
    for (const lane of Object.values(ledger.byLocation)) {
      for (const w of analyzeLaneWindows(lane)) out.push({ locationName: lane.locationName, w });
    }
    // Ongoing first, then worst depth.
    return out.sort((a, b) => Number(a.w.end !== null) - Number(b.w.end !== null) || a.w.depth - b.w.depth);
  }, [ledger]);

  if (windows.length === 0) {
    return <p className="text-sm text-muted-foreground">No negative windows for this item. 🎉</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {windows.length} negative window{windows.length > 1 ? 's' : ''} (ongoing first). Each row is one transaction —
        <span className="text-red-700 font-medium"> Caused ↓</span> drove it negative,
        <span className="text-green-700 font-medium"> Stopped ↑</span> replenished it. Click a header to collapse;
        click <span className="font-medium">What if</span> on an editable row to test a fix below.
      </p>
      {windows.map(({ locationName, w }, i) => (
        <WindowBlock
          key={`${locationName}|${w.start}|${i}`}
          locationName={locationName}
          w={w}
          defaultOpen={w.end === null || i === 0}
          snapshotsApplied={snapshotsApplied}
          selectedTxnId={selectedTxnId}
          onSelectTxn={onSelectTxn}
        />
      ))}
    </div>
  );
}
