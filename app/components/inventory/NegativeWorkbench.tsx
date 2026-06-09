'use client';

import { useMemo } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Wrench, AlertTriangle } from 'lucide-react';
import type { Ledger } from '../../../lib/inventory/balanceEngine';
import { analyzeLaneWindows, type AnalyzedTxn, type WindowAnalysis } from '../../../lib/inventory/windowAnalysis';

interface Props {
  ledger: Ledger;
  snapshotsApplied: boolean;
  selectedTxnId: string | null;
  onSelectTxn: (nsTransactionId: string) => void;
}

const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** One transaction line in the cause / replenishment list. */
function TxnLine({
  t,
  selected,
  onSelect,
}: {
  t: AnalyzedTxn;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li className={`flex items-start gap-2 rounded-md border px-2 py-1.5 ${selected ? 'border-accent bg-accent/5' : 'border-border'}`}>
      <span className={`mt-0.5 font-mono text-xs font-semibold ${t.qty < 0 ? 'text-destructive' : 'text-green-700'}`}>
        {t.qty > 0 ? '+' : ''}{fmt(t.qty)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-mono font-medium">{t.doc || '(no doc)'}</span>
          <span className="text-muted-foreground">· {t.typeLabel}</span>
          <span className="text-muted-foreground">· {fmtDate(t.date)}</span>
          {t.fromTO && <span className="rounded bg-violet-100 px-1 text-[10px] font-medium text-violet-800">from TO</span>}
          {t.editable ? (
            <span className="rounded bg-green-100 px-1 text-[10px] font-medium text-green-800">editable</span>
          ) : (
            <span className="rounded bg-slate-100 px-1 text-[10px] font-medium text-slate-600">not editable</span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t.note}</p>
      </div>
      {t.editable && (
        <button
          onClick={() => onSelect(t.nsTransactionId)}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-secondary"
          title="Load this transaction into the Fix Simulator below"
        >
          <Wrench className="h-3 w-3" /> What if
        </button>
      )}
    </li>
  );
}

function WindowCard({
  locationName,
  w,
  snapshotsApplied,
  selectedTxnId,
  onSelectTxn,
}: {
  locationName: string;
  w: WindowAnalysis;
  snapshotsApplied: boolean;
  selectedTxnId: string | null;
  onSelectTxn: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <span className="font-medium text-sm">{locationName}</span>
        <span className="font-mono text-xs text-destructive font-semibold">{fmt(w.depth)}</span>
        <span className="text-xs text-muted-foreground">
          {fmtDate(w.start)} → {w.end ? fmtDate(w.end) : 'ongoing'} ({w.durationDays}d)
        </span>
        {w.end === null && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">ongoing</span>}
        {snapshotsApplied && w.unreconciled && (
          <span className="inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 text-[10px] font-medium text-orange-800" title="This window overlaps a span NetSuite couldn't reconcile against a trusted snapshot — numbers are approximate. Capture a snapshot inside it to verify.">
            <AlertTriangle className="h-3 w-3" /> approximate
          </span>
        )}
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <ArrowDownCircle className="h-3.5 w-3.5" /> What caused it
          </div>
          {w.causedBy.length ? (
            <ul className="space-y-1">
              {w.causedBy.map((t) => (
                <TxnLine key={t.id} t={t} selected={t.nsTransactionId === selectedTxnId} onSelect={onSelectTxn} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No outbound transactions in the window (opening was already negative).</p>
          )}
        </div>
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-green-700">
            <ArrowUpCircle className="h-3.5 w-3.5" /> What stopped it
          </div>
          {w.stoppedBy.length ? (
            <ul className="space-y-1">
              {w.stoppedBy.map((t) => (
                <TxnLine key={t.id} t={t} selected={t.nsTransactionId === selectedTxnId} onSelect={onSelectTxn} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              {w.end === null ? 'Still negative — nothing has replenished this location yet.' : 'No inbound transaction on the recovery date.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function NegativeWorkbench({ ledger, snapshotsApplied, selectedTxnId, onSelectTxn }: Props) {
  // One entry per (location, window), worst depth first.
  const windows = useMemo(() => {
    const out: { locationName: string; w: WindowAnalysis }[] = [];
    for (const lane of Object.values(ledger.byLocation)) {
      for (const w of analyzeLaneWindows(lane)) out.push({ locationName: lane.locationName, w });
    }
    return out.sort((a, b) => a.w.depth - b.w.depth);
  }, [ledger]);

  if (windows.length === 0) {
    return <p className="text-sm text-muted-foreground">No negative windows for this item. 🎉</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {windows.length} negative window{windows.length > 1 ? 's' : ''}. For each, “what caused it” lists the outbound
        transactions (editable ones can be sent to the simulator); “what stopped it” lists the replenishment that
        recovered the balance. Click <span className="font-medium">What if</span> on any editable transaction to test a fix below.
      </p>
      {windows.map(({ locationName, w }, i) => (
        <WindowCard
          key={`${locationName}|${w.start}|${i}`}
          locationName={locationName}
          w={w}
          snapshotsApplied={snapshotsApplied}
          selectedTxnId={selectedTxnId}
          onSelectTxn={onSelectTxn}
        />
      ))}
    </div>
  );
}
