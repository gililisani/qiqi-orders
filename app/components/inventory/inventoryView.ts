/**
 * View-model helpers shared by the timeline and the transaction table.
 * Pure transforms over the engine's Ledger — no React, no I/O.
 */
import type { Ledger, AnnotatedTxn, TranType } from '@/lib/inventory/balanceEngine';

export interface InvTableRow {
  key: string;
  nsTransactionId: string;
  date: string;
  tranType: TranType;
  nsTypeName?: string | null;
  docNumber: string;
  fromLocation: string | null; // transfers only
  toLocation: string; // affecting location (dest leg for transfers)
  qty: number; // signed for single-leg; transfer magnitude for transfers
  balFrom: number | null; // running balance at source after tx (transfers)
  balTo: number | null; // running balance at affecting location after tx
  memo?: string;
  suspect: boolean;
}

/** One row per transaction; the two legs of a transfer are merged into one. */
export function buildTableRows(ledger: Ledger): InvTableRow[] {
  const all: AnnotatedTxn[] = [];
  for (const loc of Object.values(ledger.byLocation)) all.push(...loc.rows);

  const byTx = new Map<string, AnnotatedTxn[]>();
  for (const r of all) {
    const arr = byTx.get(r.nsTransactionId);
    if (arr) arr.push(r);
    else byTx.set(r.nsTransactionId, [r]);
  }

  const rows: InvTableRow[] = [];
  for (const [txId, legs] of byTx) {
    const isTransfer =
      legs.length >= 2 &&
      legs.every((l) => l.tranType === 'IT') &&
      legs.some((l) => l.signedQty < 0) &&
      legs.some((l) => l.signedQty > 0);

    if (isTransfer) {
      const src = legs.find((l) => l.signedQty < 0)!;
      const dst = legs.find((l) => l.signedQty > 0)!;
      rows.push({
        key: txId,
        nsTransactionId: txId,
        date: src.tranDate,
        tranType: 'IT',
        nsTypeName: src.nsType,
        docNumber: src.docNumber,
        fromLocation: src.locationName,
        toLocation: dst.locationName,
        qty: Math.abs(src.signedQty),
        balFrom: src.runningBalance,
        balTo: dst.runningBalance,
        memo: src.memo,
        suspect: src.suspect || dst.suspect,
      });
    } else {
      for (const r of legs) {
        rows.push({
          key: r.id,
          nsTransactionId: txId,
          date: r.tranDate,
          tranType: r.tranType,
          nsTypeName: r.nsType,
          docNumber: r.docNumber,
          fromLocation: null,
          toLocation: r.locationName,
          qty: r.signedQty,
          balFrom: null,
          balTo: r.runningBalance,
          memo: r.memo,
          suspect: r.suspect,
        });
      }
    }
  }

  rows.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.docNumber < b.docNumber ? -1 : a.docNumber > b.docNumber ? 1 : 0,
  );
  return rows;
}

// Marker visual config per transaction type (matches the spec).
export const TYPE_META: Record<TranType, { label: string; color: string; shape: 'up' | 'down' | 'diamond' | 'dot' | 'square' }> = {
  IR: { label: 'Item Receipt', color: '#16a34a', shape: 'up' }, // green up-arrow
  IF: { label: 'Item Fulfillment', color: '#dc2626', shape: 'down' }, // red down-arrow
  BUILD: { label: 'Assembly Build', color: '#2563eb', shape: 'diamond' }, // blue diamond
  UNBUILD: { label: 'Assembly Unbuild', color: '#0891b2', shape: 'diamond' },
  ADJ: { label: 'Inventory Adjustment', color: '#ea580c', shape: 'dot' }, // orange dot
  BILL: { label: 'Bill', color: '#6b7280', shape: 'square' },
  IT: { label: 'Inventory Transfer', color: '#7c3aed', shape: 'dot' }, // drawn as an arrow
};

export const TRANSFER_COLOR = '#7c3aed';

export function fmtQty(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
