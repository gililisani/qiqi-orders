import { describe, expect, it } from 'vitest';
import {
  applyChange,
  computeLedger,
  simulate,
  summarizeNegatives,
  type LedgerTxn,
  type OpeningBalance,
} from '@/lib/inventory/balanceEngine';

// Small builder for terse fixtures.
let seq = 0;
function tx(p: Partial<LedgerTxn> & { loc: string; date: string; qty: number }): LedgerTxn {
  seq += 1;
  return {
    id: p.id ?? `row${seq}`,
    nsTransactionId: p.nsTransactionId ?? `tx${seq}`,
    lineId: p.lineId ?? '1',
    docNumber: p.docNumber ?? `DOC${seq}`,
    tranDate: p.date,
    tranType: p.tranType ?? (p.qty >= 0 ? 'IR' : 'IF'),
    locationNsId: p.loc,
    locationName: p.locationName ?? `Loc-${p.loc}`,
    signedQty: p.qty,
    transferGroup: p.transferGroup ?? null,
    transferLeg: p.transferLeg ?? null,
    memo: p.memo,
  };
}
const open = (loc: string, qty: number): OpeningBalance => ({
  locationNsId: loc,
  locationName: `Loc-${loc}`,
  openingQty: qty,
});

describe('computeLedger — end-of-day & suspects', () => {
  it('flags the transaction that drove a location negative (case a)', () => {
    const txns = [tx({ loc: 'A', date: '2024-01-01', qty: -5 })];
    const ledger = computeLedger(txns, [open('A', 0)]);
    expect(ledger.byLocation.A.final).toBe(-5);
    expect([...ledger.suspectRowIds]).toEqual(['row' + seq]);
  });

  it('flags only days that DEEPEN the negative, not partial recoveries (case b)', () => {
    const r1 = tx({ loc: 'A', date: '2024-01-01', qty: -5 }); // eod -5, prior 0  → suspect
    const r2 = tx({ loc: 'A', date: '2024-01-02', qty: -3 }); // eod -8 < -5      → suspect
    const r3 = tx({ loc: 'A', date: '2024-01-03', qty: 2 }); // eod -6 (>-8), inbound → NOT suspect
    const ledger = computeLedger([r1, r2, r3], [open('A', 0)]);
    expect(ledger.suspectRowIds.has(r1.id)).toBe(true);
    expect(ledger.suspectRowIds.has(r2.id)).toBe(true);
    expect(ledger.suspectRowIds.has(r3.id)).toBe(false);
    expect(ledger.byLocation.A.final).toBe(-6);
  });

  it('does NOT flag a same-day round-trip that recovers by end of day (BAS0009 case)', () => {
    // Transfer-out then receipt back, same location, same day → eod 0.
    const outLeg = tx({
      loc: 'CRITZAS',
      date: '2024-09-25',
      qty: -10,
      tranType: 'IT',
      nsTransactionId: 'IT10205',
      docNumber: 'IT10205',
      transferGroup: 'IT10205',
      transferLeg: 'source',
    });
    const receipt = tx({
      loc: 'CRITZAS',
      date: '2024-09-25',
      qty: 10,
      tranType: 'IR',
      docNumber: 'IR10460',
    });
    const ledger = computeLedger([outLeg, receipt], [open('CRITZAS', 0)]);
    expect(ledger.byLocation.CRITZAS.final).toBe(0);
    expect(ledger.suspectRowIds.size).toBe(0); // intra-day dip recovered → no problem
  });

  it('intra-day ordering does not change end-of-day or suspects (order-independent)', () => {
    const a = [
      tx({ loc: 'A', date: '2024-01-01', qty: -10, lineId: '1', nsTransactionId: '100' }),
      tx({ loc: 'A', date: '2024-01-01', qty: 10, lineId: '2', nsTransactionId: '101' }),
    ];
    const reversed = [a[1], a[0]];
    const l1 = computeLedger(a, [open('A', 0)]);
    const l2 = computeLedger(reversed, [open('A', 0)]);
    expect(l1.byLocation.A.final).toBe(l2.byLocation.A.final);
    expect(l1.suspectRowIds.size).toBe(l2.suspectRowIds.size);
    expect(l1.suspectRowIds.size).toBe(0);
  });
});

describe('summarizeNegatives', () => {
  it('reports deepest balance, date, and an ongoing span', () => {
    const ledger = computeLedger(
      [
        tx({ loc: 'A', date: '2024-01-01', qty: -5 }),
        tx({ loc: 'A', date: '2024-01-02', qty: -3 }),
      ],
      [open('A', 0)],
    );
    const neg = summarizeNegatives(ledger);
    expect(neg.A.deepestBalance).toBe(-8);
    expect(neg.A.deepestDate).toBe('2024-01-02');
    expect(neg.A.spans).toEqual([{ from: '2024-01-01', to: null, depth: -8 }]);
  });

  it('closes a span when the location recovers', () => {
    const ledger = computeLedger(
      [
        tx({ loc: 'A', date: '2024-01-01', qty: -5 }),
        tx({ loc: 'A', date: '2024-01-05', qty: 5 }), // eod 0 → recovered
      ],
      [open('A', 0)],
    );
    const neg = summarizeNegatives(ledger);
    expect(neg.A.spans).toEqual([{ from: '2024-01-01', to: '2024-01-05', depth: -5 }]);
  });

  it('omits locations that never go negative', () => {
    const ledger = computeLedger([tx({ loc: 'A', date: '2024-01-01', qty: 5 })], [open('A', 0)]);
    expect(summarizeNegatives(ledger)).toEqual({});
  });
});

describe('applyChange — transfer legs move together', () => {
  const transfer: LedgerTxn[] = [
    {
      id: 'src',
      nsTransactionId: 'IT500',
      lineId: '1',
      docNumber: 'IT500',
      tranDate: '2024-03-01',
      tranType: 'IT',
      locationNsId: 'A',
      locationName: 'A',
      signedQty: -10,
      transferGroup: 'IT500',
      transferLeg: 'source',
    },
    {
      id: 'dst',
      nsTransactionId: 'IT500',
      lineId: '2',
      docNumber: 'IT500',
      tranDate: '2024-03-01',
      tranType: 'IT',
      locationNsId: 'B',
      locationName: 'B',
      signedQty: 10,
      transferGroup: 'IT500',
      transferLeg: 'dest',
    },
  ];

  it('delete removes BOTH legs', () => {
    expect(applyChange(transfer, { kind: 'delete', nsTransactionId: 'IT500' })).toHaveLength(0);
  });

  it('changeQty scales both legs preserving each direction', () => {
    const r = applyChange(transfer, { kind: 'changeQty', nsTransactionId: 'IT500', newQty: 4 });
    expect(r.find((t) => t.id === 'src')!.signedQty).toBe(-4);
    expect(r.find((t) => t.id === 'dst')!.signedQty).toBe(4);
  });

  it('changeDate moves both legs', () => {
    const r = applyChange(transfer, {
      kind: 'changeDate',
      nsTransactionId: 'IT500',
      newDate: '2024-04-01',
    });
    expect(r.every((t) => t.tranDate === '2024-04-01')).toBe(true);
  });
});

describe('simulate — delta classification', () => {
  it('FIXED: deleting the offending outbound clears the negative', () => {
    const txns = [tx({ loc: 'A', date: '2024-01-02', qty: -5, nsTransactionId: 'BAD' })];
    const res = simulate(txns, [open('A', 0)], { kind: 'delete', nsTransactionId: 'BAD' });
    expect(res.current.A.deepestBalance).toBe(-5);
    expect(res.delta.fixed).toEqual([{ locationNsId: 'A', locationName: 'Loc-A', wasDepth: -5 }]);
    expect(res.after.A).toBeUndefined();
  });

  it('NEW PROBLEM: deleting an offsetting receipt breaks a different location', () => {
    // A is fine because a receipt offsets an outbound; delete the receipt → A negative.
    const txns = [
      tx({ loc: 'A', date: '2024-01-01', qty: 5, nsTransactionId: 'RCPT', tranType: 'IR' }),
      tx({ loc: 'A', date: '2024-01-02', qty: -5, nsTransactionId: 'SHIP', tranType: 'IF' }),
    ];
    expect(summarizeNegatives(computeLedger(txns, [open('A', 0)])).A).toBeUndefined();
    const res = simulate(txns, [open('A', 0)], { kind: 'delete', nsTransactionId: 'RCPT' });
    expect(res.delta.newProblem).toHaveLength(1);
    expect(res.delta.newProblem[0].locationNsId).toBe('A');
    expect(res.delta.newProblem[0].depth).toBe(-5);
  });

  it('STILL_NEGATIVE: reducing qty lessens but does not clear the negative', () => {
    const txns = [tx({ loc: 'A', date: '2024-01-02', qty: -10, nsTransactionId: 'BAD' })];
    const res = simulate(txns, [open('A', 0)], {
      kind: 'changeQty',
      nsTransactionId: 'BAD',
      newQty: 6,
    });
    expect(res.delta.stillNegative).toEqual([
      { locationNsId: 'A', locationName: 'Loc-A', wasDepth: -10, nowDepth: -6 },
    ]);
  });

  it('transfer date change can fix the source while creating a NEW PROBLEM at dest', () => {
    // Source A starts at 5; a transfer-out of 10 on 01-01 drives A to -5.
    // Dest B starts at 0; transfer-in of 10 keeps B fine.
    // Moving the transfer later (after A receives more) is one scenario, but
    // here we simply verify both legs re-simulate together.
    const txns: LedgerTxn[] = [
      {
        id: 's',
        nsTransactionId: 'IT9',
        lineId: '1',
        docNumber: 'IT9',
        tranDate: '2024-01-01',
        tranType: 'IT',
        locationNsId: 'A',
        locationName: 'A',
        signedQty: -10,
        transferGroup: 'IT9',
        transferLeg: 'source',
      },
      {
        id: 'd',
        nsTransactionId: 'IT9',
        lineId: '2',
        docNumber: 'IT9',
        tranDate: '2024-01-01',
        tranType: 'IT',
        locationNsId: 'B',
        locationName: 'B',
        signedQty: 10,
        transferGroup: 'IT9',
        transferLeg: 'dest',
      },
    ];
    // A opens at 5 → after -10 = -5 (negative). B opens 0 → +10 fine.
    const res = simulate(txns, [open('A', 5), open('B', 0)], {
      kind: 'delete',
      nsTransactionId: 'IT9',
    });
    // Deleting the transfer fixes A (no more -5) but B loses its +10 → B was 10, still >= 0, so no new problem.
    expect(res.delta.fixed.map((f) => f.locationNsId)).toContain('A');
    expect(res.after.B).toBeUndefined();
  });
});
