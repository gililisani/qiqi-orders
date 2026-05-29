'use client';

import { useMemo, useState } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../qq/table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../qq/select';
import type { InvTableRow } from './inventoryView';
import { TYPE_META, fmtQty } from './inventoryView';
import type { TranType } from '@/lib/inventory/balanceEngine';

interface Props {
  rows: InvTableRow[];
  selectedTxnId: string | null;
  onSelectTxn: (id: string) => void;
}

export function InventoryTransactionTable({ rows, selectedTxnId, onSelectTxn }: Props) {
  const [loc, setLoc] = useState('all');
  const [type, setType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [suspectsOnly, setSuspectsOnly] = useState(false);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const locations = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      s.add(r.toLocation);
      if (r.fromLocation) s.add(r.fromLocation);
    }
    return [...s].sort();
  }, [rows]);

  const types = useMemo(() => {
    const s = new Set<TranType>();
    for (const r of rows) s.add(r.tranType);
    return [...s];
  }, [rows]);

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (suspectsOnly && !r.suspect) return false;
      if (type !== 'all' && r.tranType !== type) return false;
      if (loc !== 'all' && r.toLocation !== loc && r.fromLocation !== loc) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      return true;
    });
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * (sortDir === 'asc' ? 1 : -1));
    return out;
  }, [rows, loc, type, from, to, suspectsOnly, sortDir]);

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Select value={loc} onValueChange={setLoc}>
          <SelectTrigger className="h-9 w-[200px] text-sm">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 w-[170px] text-sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_META[t].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="From date"
        />
        <span className="text-muted-foreground text-sm">–</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="To date"
        />

        <label className="flex items-center gap-1.5 text-sm text-foreground ml-1">
          <input type="checkbox" checked={suspectsOnly} onChange={(e) => setSuspectsOnly(e.target.checked)} />
          Suspects only
        </label>

        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} of {rows.length}</span>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <div className="max-h-[440px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-6"></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                  Date {sortDir === 'asc' ? '↑' : '↓'}
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Doc #</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Bal&nbsp;From</TableHead>
                <TableHead className="text-right">Bal&nbsp;To</TableHead>
                <TableHead>Memo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const selected = r.nsTransactionId === selectedTxnId;
                return (
                  <TableRow
                    key={r.key}
                    onClick={() => onSelectTxn(r.nsTransactionId)}
                    className={`cursor-pointer ${selected ? 'bg-secondary' : ''}`}
                  >
                    <TableCell className="py-1.5">
                      {r.suspect && <span className="inline-block h-2 w-2 rounded-full bg-destructive" title="Suspect" />}
                    </TableCell>
                    <TableCell className="py-1.5 whitespace-nowrap font-mono text-xs">{r.date}</TableCell>
                    <TableCell className="py-1.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: TYPE_META[r.tranType].color }} />
                        {r.nsTypeName || TYPE_META[r.tranType].label}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 font-mono text-xs">{r.docNumber}</TableCell>
                    <TableCell className="py-1.5 text-xs text-muted-foreground">{r.fromLocation ?? ''}</TableCell>
                    <TableCell className="py-1.5 text-xs">{r.toLocation}</TableCell>
                    <TableCell className={`py-1.5 text-right font-mono text-xs ${r.qty < 0 ? 'text-destructive' : ''}`}>{fmtQty(r.qty)}</TableCell>
                    <TableCell className={`py-1.5 text-right font-mono text-xs ${r.balFrom != null && r.balFrom < 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                      {r.balFrom != null ? fmtQty(r.balFrom) : ''}
                    </TableCell>
                    <TableCell className={`py-1.5 text-right font-mono text-xs ${r.balTo != null && r.balTo < 0 ? 'text-destructive font-semibold' : ''}`}>
                      {r.balTo != null ? fmtQty(r.balTo) : ''}
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-muted-foreground max-w-[220px] truncate" title={r.memo}>
                      {r.memo}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
