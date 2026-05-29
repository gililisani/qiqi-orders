'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pin, PinOff, RotateCcw, Play } from 'lucide-react';

import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { Button } from '../qq/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../qq/select';
import {
  simulate,
  type LedgerTxn,
  type OpeningBalance,
  type SimChange,
  type SimResult,
  type NegativeSummary,
} from '@/lib/inventory/balanceEngine';
import { fmtQty } from './inventoryView';

type Action = 'changeDate' | 'changeQty' | 'delete';

interface Props {
  itemCode: string;
  txns: LedgerTxn[];
  openings: OpeningBalance[];
  selectedTxnId: string | null;
  plannedTxnIds: Set<string>;
  onMarkersChanged: () => void | Promise<void>;
}

export function InventorySimulator({
  itemCode,
  txns,
  openings,
  selectedTxnId,
  plannedTxnIds,
  onMarkersChanged,
}: Props) {
  const legs = useMemo(
    () => txns.filter((t) => t.nsTransactionId === selectedTxnId),
    [txns, selectedTxnId],
  );
  const isTransfer = legs.length >= 2 && legs.some((l) => l.signedQty < 0) && legs.some((l) => l.signedQty > 0);
  const primary = legs.find((l) => l.signedQty < 0) ?? legs[0];
  const currentDate = primary?.tranDate ?? '';
  const currentMag = primary ? Math.abs(primary.signedQty) : 0;

  const [action, setAction] = useState<Action>('changeDate');
  const [newDate, setNewDate] = useState(currentDate);
  const [newQty, setNewQty] = useState(String(currentMag));
  const [result, setResult] = useState<SimResult | null>(null);
  const [marking, setMarking] = useState(false);

  // Reset whenever the selected transaction changes.
  useEffect(() => {
    setAction('changeDate');
    setNewDate(currentDate);
    setNewQty(String(currentMag));
    setResult(null);
  }, [selectedTxnId, currentDate, currentMag]);

  if (!selectedTxnId || legs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Click a marker on the timeline or a row in the table to load a transaction here, then
        simulate a fix.
      </p>
    );
  }

  const planned = plannedTxnIds.has(selectedTxnId);

  const buildChange = (): SimChange | null => {
    if (action === 'delete') return { kind: 'delete', nsTransactionId: selectedTxnId };
    if (action === 'changeDate') {
      if (!newDate) return null;
      return { kind: 'changeDate', nsTransactionId: selectedTxnId, newDate };
    }
    const q = Number(newQty);
    if (!Number.isFinite(q) || q < 0) return null;
    return { kind: 'changeQty', nsTransactionId: selectedTxnId, newQty: q };
  };

  const runSimulate = () => {
    const change = buildChange();
    if (!change) return;
    setResult(simulate(txns, openings, change));
  };

  const reset = () => {
    setNewDate(currentDate);
    setNewQty(String(currentMag));
    setResult(null);
  };

  const changeSummary = (): string => {
    if (action === 'delete') return 'Delete this transaction';
    if (action === 'changeDate') return `Move date ${currentDate} → ${newDate}`;
    return `Change qty ${fmtQty(currentMag)} → ${fmtQty(Number(newQty))}`;
  };

  const applyMarker = async () => {
    setMarking(true);
    try {
      if (planned) {
        await fetchWithAuth(
          `/api/inventory-investigation/${encodeURIComponent(itemCode)}/plan-markers?nsTransactionId=${encodeURIComponent(selectedTxnId)}`,
          { method: 'DELETE' },
        );
      } else {
        await fetchWithAuth(`/api/inventory-investigation/${encodeURIComponent(itemCode)}/plan-markers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nsTransactionId: selectedTxnId,
            plannedAction: action,
            proposedValue: action === 'changeDate' ? newDate : action === 'changeQty' ? newQty : null,
            note: changeSummary(),
          }),
        });
      }
      await onMarkersChanged();
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Selected transaction */}
      <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
        <div className="font-medium">{primary.docNumber || '—'}</div>
        <div className="text-xs text-muted-foreground">
          {primary.nsType || primary.tranType} · {currentDate}
          {isTransfer && ' · transfer'}
        </div>
        <div className="mt-1 space-y-0.5">
          {legs.map((l) => (
            <div key={l.id} className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground truncate">{l.locationName}</span>
              <span className={`font-mono ${l.signedQty < 0 ? 'text-destructive' : ''}`}>{fmtQty(l.signedQty)}</span>
            </div>
          ))}
        </div>
        {planned && (
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-500">★ marked: planning to fix</div>
        )}
      </div>

      {/* Proposed change */}
      <div className="space-y-2">
        <Select value={action} onValueChange={(v) => { setAction(v as Action); setResult(null); }}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="changeDate">Change date</SelectItem>
            <SelectItem value="changeQty">Change quantity</SelectItem>
            <SelectItem value="delete">Delete transaction</SelectItem>
          </SelectContent>
        </Select>

        {action === 'changeDate' && (
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          />
        )}
        {action === 'changeQty' && (
          <div>
            <input
              type="number"
              min={0}
              step="any"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-mono"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {isTransfer
                ? 'Applied to both transfer legs (out at source, in at destination).'
                : primary.signedQty < 0
                ? 'Magnitude — stays outbound (−).'
                : 'Magnitude — stays inbound (+).'}
            </p>
          </div>
        )}
        {action === 'delete' && (
          <p className="text-[11px] text-muted-foreground">
            {isTransfer ? 'Removes both legs of the transfer.' : 'Removes this transaction.'}
          </p>
        )}

        <div className="flex gap-2">
          <Button size="sm" onClick={runSimulate} className="flex-1">
            <Play className="h-3.5 w-3.5" /> Simulate
          </Button>
          {result && (
            <Button size="sm" variant="outline" onClick={reset} title="Try another fix">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          )}
        </div>
      </div>

      {result && <DeltaResult result={result} summary={changeSummary()} />}

      {/* Visual planning marker */}
      <Button size="sm" variant={planned ? 'secondary' : 'outline'} onClick={applyMarker} loading={marking} className="w-full">
        {planned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        {planned ? 'Remove planning marker' : 'Apply visual marker'}
      </Button>
    </div>
  );
}

function negEntries(s: NegativeSummary) {
  return Object.values(s).sort((a, b) => a.deepestBalance - b.deepestBalance);
}

function DeltaResult({ result, summary }: { result: SimResult; summary: string }) {
  const { current, after, delta } = result;
  const hasNew = delta.newProblem.length > 0;
  const allFixed = delta.fixed.length > 0 && delta.stillNegative.length === 0 && !hasNew;

  let headlineClass = 'bg-secondary text-foreground';
  let headline = 'No change to negative locations';
  if (hasNew) {
    headlineClass = 'bg-destructive/10 text-destructive border border-destructive/40';
    headline = `⚠ Creates ${delta.newProblem.length} NEW problem location${delta.newProblem.length > 1 ? 's' : ''}`;
  } else if (allFixed) {
    headlineClass = 'bg-green-50 text-green-700 border border-green-300';
    headline = `✓ Fixes ${delta.fixed.length} location${delta.fixed.length > 1 ? 's' : ''}, no new problems`;
  } else if (delta.fixed.length > 0) {
    headlineClass = 'bg-amber-50 text-amber-800 border border-amber-300';
    headline = `Partial — fixes ${delta.fixed.length}, ${delta.stillNegative.length} still negative`;
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="text-[11px] text-muted-foreground">{summary}</div>

      <div className={`rounded-md px-3 py-2 font-medium ${headlineClass}`}>{headline}</div>

      {/* Delta — the part that matters most */}
      <div className="space-y-1.5">
        {delta.newProblem.map((d) => (
          <div key={d.locationNsId} className="rounded-md border-2 border-destructive bg-destructive/10 px-2.5 py-1.5">
            <div className="font-semibold text-destructive">NEW PROBLEM · {d.locationName}</div>
            <div className="text-xs text-destructive">
              now {fmtQty(d.depth)}
              {d.spans[0] && ` · ${d.spans[0].from}${d.spans[0].to ? `–${d.spans[0].to}` : ' (ongoing)'}`}
            </div>
          </div>
        ))}
        {delta.stillNegative.map((d) => (
          <div key={d.locationNsId} className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5">
            <span className="font-medium text-amber-800">STILL NEGATIVE · {d.locationName}</span>
            <span className="text-xs text-amber-700"> — now {fmtQty(d.nowDepth)} (was {fmtQty(d.wasDepth)})</span>
          </div>
        ))}
        {delta.fixed.map((d) => (
          <div key={d.locationNsId} className="rounded-md bg-green-50 border border-green-200 px-2.5 py-1.5">
            <span className="font-medium text-green-700">FIXED · {d.locationName}</span>
            <span className="text-xs text-green-600"> — no longer negative (was {fmtQty(d.wasDepth)})</span>
          </div>
        ))}
        {delta.newProblem.length === 0 && delta.stillNegative.length === 0 && delta.fixed.length === 0 && (
          <div className="text-xs text-muted-foreground">No location crosses zero either way.</div>
        )}
      </div>

      {/* Before / after detail */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <BeforeAfter title="Current" entries={negEntries(current)} />
        <BeforeAfter title="After fix" entries={negEntries(after)} />
      </div>
    </div>
  );
}

function BeforeAfter({ title, entries }: { title: string; entries: ReturnType<typeof negEntries> }) {
  return (
    <div className="rounded-md border border-border px-2 py-1.5">
      <div className="text-[11px] font-semibold text-muted-foreground mb-1">{title} — negative</div>
      {entries.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">none</div>
      ) : (
        <ul className="space-y-0.5">
          {entries.map((e) => (
            <li key={e.locationNsId} className="text-[11px] flex justify-between gap-1">
              <span className="truncate">{e.locationName}</span>
              <span className="font-mono text-destructive">{fmtQty(e.deepestBalance)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
