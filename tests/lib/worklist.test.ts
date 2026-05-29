import { describe, expect, it } from 'vitest';
import { computeWorklistForItem, type ItemMeta } from '@/lib/inventory/worklist';
import type { LedgerTxn, OpeningBalance } from '@/lib/inventory/balanceEngine';

const META: ItemMeta = { itemCode: 'TEST', nsItemId: '1', itemName: 'Test item' };
const open = (loc: string, qty: number): OpeningBalance => ({ locationNsId: loc, locationName: `Loc-${loc}`, openingQty: qty });

let seq = 0;
function tx(p: { tx?: string; loc: string; date: string; qty: number; type?: LedgerTxn['tranType']; group?: string }): LedgerTxn {
  seq += 1;
  const isIT = p.type === 'IT';
  return {
    id: `r${seq}`,
    nsTransactionId: p.tx ?? `t${seq}`,
    lineId: String(seq),
    docNumber: p.tx ?? `DOC${seq}`,
    tranDate: p.date,
    tranType: p.type ?? (p.qty >= 0 ? 'IR' : 'IF'),
    locationNsId: p.loc,
    locationName: `Loc-${p.loc}`,
    signedQty: p.qty,
    transferGroup: isIT ? p.group ?? p.tx ?? null : null,
    transferLeg: isIT ? (p.qty < 0 ? 'source' : 'dest') : null,
  };
}

describe('computeWorklistForItem', () => {
  it('REDUCE_QTY clean — reduces outbound to zero the suspect-day EOD (COM0046 shape)', () => {
    const txns = [
      tx({ loc: 'A', date: '2024-08-01', qty: 11925, type: 'IR' }),
      tx({ loc: 'A', date: '2024-08-06', qty: -25970, type: 'IF', tx: 'OUT' }),
    ];
    const [row] = computeWorklistForItem(META, txns, [open('A', 0)]);
    expect(row.locationNsId).toBe('A');
    expect(row.depth).toBe(-14045);
    expect(row.since).toBe('2024-08-06');
    expect(row.recommendedAction).toBe('REDUCE_QTY');
    expect(row.changeFrom).toBe('25,970');
    expect(row.changeTo).toBe('11,925');
    expect(row.confidence).toBe('CLEAN');
  });

  it('PARTIAL — reducing a transfer resolves source but breaks destination', () => {
    const txns = [
      tx({ loc: 'A', date: '2024-08-01', qty: 11925, type: 'IR' }),
      tx({ tx: 'IT1', loc: 'A', date: '2024-08-06', qty: -25970, type: 'IT', group: 'IT1' }),
      tx({ tx: 'IT1', loc: 'B', date: '2024-08-06', qty: 25970, type: 'IT', group: 'IT1' }),
      tx({ loc: 'B', date: '2024-09-01', qty: -20000, type: 'BUILD' }),
    ];
    const rows = computeWorklistForItem(META, txns, [open('A', 0), open('B', 0)]);
    const a = rows.find((r) => r.locationNsId === 'A')!;
    expect(a.confidence).toBe('PARTIAL');
    expect(a.recommendedAction).toBe('MANUAL_REVIEW');
    expect(a.changeTo).toBe('11,925'); // reduce is the least-collateral candidate
    expect(a.notes).toMatch(/Loc-B/);
  });

  it('DELETE clean — when reduce-to-zero is not feasible', () => {
    const txns = [tx({ loc: 'A', date: '2024-03-02', qty: -50, type: 'IF', tx: 'BAD' })];
    const [row] = computeWorklistForItem(META, txns, [open('A', 0)]);
    expect(row.recommendedAction).toBe('DELETE');
    expect(row.changeTo).toBe('delete');
    expect(row.confidence).toBe('CLEAN');
  });

  it('CHANGE_DATE_FORWARD clean — when delete would break the paired location', () => {
    const txns = [
      tx({ tx: 'IT', loc: 'A', date: '2024-01-01', qty: -10, type: 'IT', group: 'IT' }),
      tx({ tx: 'IT', loc: 'B', date: '2024-01-01', qty: 10, type: 'IT', group: 'IT' }),
      tx({ loc: 'A', date: '2024-01-02', qty: 10, type: 'IR' }), // replenishment at A
      tx({ loc: 'B', date: '2024-01-03', qty: -10, type: 'BUILD' }), // B consumes on the 3rd
    ];
    const rows = computeWorklistForItem(META, txns, [open('A', 0), open('B', 0)]);
    const a = rows.find((r) => r.locationNsId === 'A')!;
    // delete would leave B at -10 on the 3rd (no inbound) → not clean.
    // moving the transfer to 2024-01-03 lets A replenish first and B's same-day
    // consumption nets to zero → clean.
    expect(a.recommendedAction).toBe('CHANGE_DATE_FORWARD');
    expect(a.confidence).toBe('CLEAN');
    expect(a.changeTo).toBe('2024-01-03');
  });

  it('MANUAL_REVIEW / NONE — negative with no outbound suspect (negative opening)', () => {
    const txns = [tx({ loc: 'A', date: '2024-05-01', qty: 3, type: 'IR' })];
    const [row] = computeWorklistForItem(META, txns, [open('A', -5)]); // opening below zero
    expect(row.recommendedAction).toBe('MANUAL_REVIEW');
    expect(row.confidence).toBe('NONE');
    expect(row.suspectNsTransactionId).toBeNull();
  });
});
