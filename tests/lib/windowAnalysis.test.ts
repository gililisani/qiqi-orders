import { describe, it, expect } from 'vitest';
import { computeLedger, type LedgerTxn, type OpeningBalance } from '@/lib/inventory/balanceEngine';
import { analyzeLaneWindows, classifyTxn } from '@/lib/inventory/windowAnalysis';

function tx(o: {
  id: string;
  date: string;
  qty: number;
  type: string;
  chainRole?: 'if' | 'ir';
}): LedgerTxn {
  return {
    id: o.id,
    nsTransactionId: o.id,
    lineId: '1',
    docNumber: `DOC${o.id}`,
    tranDate: o.date,
    tranType: 'ADJ',
    nsTypeCode: o.type,
    nsType: o.type,
    locationNsId: 'L1',
    locationName: 'Packable - Qiqi INC',
    signedQty: o.qty,
    transferGroup: null,
    transferLeg: null,
    chainRole: o.chainRole ?? null,
    chainPartnerTxId: o.chainRole ? 'partner' : null,
  };
}
const opening = (q: number): OpeningBalance[] => [
  { locationNsId: 'L1', locationName: 'Packable - Qiqi INC', openingQty: q, currentQoh: q },
];

describe('classifyTxn', () => {
  it('treats an IF generated from a TO as editable, a client IF as not', () => {
    const fromTO = classifyTxn({ ...tx({ id: 'a', date: '2024-10-05', qty: -2, type: 'ItemShip', chainRole: 'if' }), runningBalance: 0, suspect: false });
    expect(fromTO.fromTO).toBe(true);
    expect(fromTO.editable).toBe(true);

    const client = classifyTxn({ ...tx({ id: 'b', date: '2024-10-04', qty: -3, type: 'ItemShip' }), runningBalance: 0, suspect: false });
    expect(client.fromTO).toBe(false);
    expect(client.editable).toBe(false);
    expect(client.note).toMatch(/oversold/i);
  });

  it('marks IT / Adjustment / IR as editable', () => {
    for (const t of ['InvTrnfr', 'InvAdjst', 'ItemRcpt']) {
      expect(classifyTxn({ ...tx({ id: t, date: '2024-10-02', qty: -1, type: t }), runningBalance: 0, suspect: false }).editable).toBe(true);
    }
  });
});

describe('analyzeLaneWindows', () => {
  // +5 opening; IT-out drives it negative, a client IF + a TO-IF deepen it, an
  // IR replenishes it back positive on 10-08.
  const txns = [
    tx({ id: 't1', date: '2024-10-02', qty: -12, type: 'InvTrnfr' }), // 5 -> -7
    tx({ id: 't2', date: '2024-10-04', qty: -3, type: 'ItemShip' }), //  -7 -> -10 (client)
    tx({ id: 't3', date: '2024-10-05', qty: -2, type: 'ItemShip', chainRole: 'if' }), // -10 -> -12 (from TO)
    tx({ id: 't4', date: '2024-10-08', qty: 503, type: 'ItemRcpt' }), // -12 -> 491 (recovery)
  ];
  const lane = computeLedger(txns, opening(5)).byLocation['L1'];
  const [w] = analyzeLaneWindows(lane);

  it('finds the window bounds from the anchored timeline', () => {
    expect(w.start).toBe('2024-10-02');
    expect(w.end).toBe('2024-10-08');
  });

  it('lists all outbound causes, most-negative first, classified', () => {
    expect(w.causedBy.map((c) => c.nsTransactionId)).toEqual(['t1', 't2', 't3']);
    expect(w.causedBy.find((c) => c.nsTransactionId === 't1')?.editable).toBe(true); // IT
    expect(w.causedBy.find((c) => c.nsTransactionId === 't2')?.editable).toBe(false); // client IF
    expect(w.causedBy.find((c) => c.nsTransactionId === 't3')?.fromTO).toBe(true); // TO IF
  });

  it('identifies the replenishment that stopped it (recovery-date inflow)', () => {
    expect(w.stoppedBy).toHaveLength(1);
    expect(w.stoppedBy[0]).toMatchObject({ nsTransactionId: 't4', typeLabel: 'Item Receipt', qty: 503 });
  });

  it('reports an ongoing window with no replenishment', () => {
    const ongoing = computeLedger([tx({ id: 'x', date: '2024-11-01', qty: -50, type: 'InvTrnfr' })], opening(0)).byLocation['L1'];
    const [ow] = analyzeLaneWindows(ongoing);
    expect(ow.end).toBeNull();
    expect(ow.stoppedBy).toEqual([]);
  });
});
