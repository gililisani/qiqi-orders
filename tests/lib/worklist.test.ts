import { describe, expect, it } from 'vitest';
import { computeWorklistForItem, validateWorklist, type ItemMeta } from '@/lib/inventory/worklist';
import type { LedgerTxn, OpeningBalance } from '@/lib/inventory/balanceEngine';

const META: ItemMeta = { itemCode: 'TEST', nsItemId: '1', itemName: 'Test item' };
const open = (loc: string, qty: number): OpeningBalance => ({ locationNsId: loc, locationName: `Loc-${loc}`, openingQty: qty });

let seq = 0;
// nsTypeCode drives editability. tx() takes the RAW NS type code.
function tx(p: { tx?: string; loc: string; date: string; qty: number; code: string; group?: string }): LedgerTxn {
  seq += 1;
  const isIT = p.code === 'InvTrnfr';
  const enumByCode: Record<string, LedgerTxn['tranType']> = {
    InvTrnfr: 'IT', ItemRcpt: 'IR', InvAdjst: 'ADJ', VendBill: 'BILL', Build: 'BUILD', ItemShip: 'IF',
  };
  return {
    id: `r${seq}`,
    nsTransactionId: p.tx ?? `t${seq}`,
    lineId: String(seq),
    docNumber: p.tx ?? `DOC${seq}`,
    tranDate: p.date,
    tranType: enumByCode[p.code] ?? 'ADJ',
    nsType: p.code,
    nsTypeCode: p.code,
    locationNsId: p.loc,
    locationName: `Loc-${p.loc}`,
    signedQty: p.qty,
    transferGroup: isIT ? p.group ?? p.tx ?? null : null,
    transferLeg: isIT ? (p.qty < 0 ? 'source' : 'dest') : null,
  };
}

describe('computeWorklistForItem — hard business rules', () => {
  it('RULE 1: negative originating before 2024 is CLOSED PERIOD, no edit', () => {
    const txns = [
      tx({ loc: 'A', date: '2023-06-01', qty: 100, code: 'ItemRcpt' }),
      tx({ loc: 'A', date: '2023-09-01', qty: -150, code: 'InvTrnfr', tx: 'IT_OLD' }),
    ];
    const [row] = computeWorklistForItem(META, txns, [open('A', 0)]);
    expect(row.category).toBe('CLOSED');
    expect(row.recommendedAction).toBe('CLOSED_PERIOD');
    expect(row.suspectNsTransactionId).toBeNull();
  });

  it('RULE 2: a negative driven only by a non-editable Build → MANUAL, no edit target', () => {
    const txns = [
      tx({ loc: 'A', date: '2024-02-01', qty: 50, code: 'ItemRcpt' }),
      tx({ loc: 'A', date: '2024-03-01', qty: -120, code: 'Build', tx: 'ASBIL1' }), // physical, not editable
    ];
    const [row] = computeWorklistForItem(META, txns, [open('A', 0)]);
    expect(row.category).toBe('MANUAL');
    expect(row.suspectNsTransactionId).toBeNull();
    expect(row.notes).toMatch(/not an editable type|Assembly Build/);
  });

  it('CLEAN: reduce an editable in-scope Inventory Transfer to zero the suspect-day EOD', () => {
    const txns = [
      tx({ loc: 'A', date: '2024-08-01', qty: 11925, code: 'ItemRcpt' }),
      tx({ tx: 'IT1', loc: 'A', date: '2024-08-06', qty: -25970, code: 'InvTrnfr', group: 'IT1' }),
      tx({ tx: 'IT1', loc: 'B', date: '2024-08-06', qty: 25970, code: 'InvTrnfr', group: 'IT1' }),
    ];
    const rows = computeWorklistForItem(META, txns, [open('A', 0), open('B', 0)]);
    const a = rows.find((r) => r.locationNsId === 'A')!;
    expect(a.category).toBe('CLEAN');
    expect(a.recommendedAction).toBe('REDUCE_QTY');
    expect(a.suspectType).toBe('InvTrnfr');
    expect(a.changeFrom).toBe('25,970');
    expect(a.changeTo).toBe('11,925');
  });

  it('does not pick a build even when a build is the deeper driver — prefers the editable transfer', () => {
    // A: receipt 100, transfer out 130 (drives -30 on 2024-05-02), build consumes more later.
    const txns = [
      tx({ loc: 'A', date: '2024-05-01', qty: 100, code: 'ItemRcpt' }),
      tx({ tx: 'IT2', loc: 'A', date: '2024-05-02', qty: -130, code: 'InvTrnfr', group: 'IT2' }),
      tx({ tx: 'IT2', loc: 'B', date: '2024-05-02', qty: 130, code: 'InvTrnfr', group: 'IT2' }),
    ];
    const rows = computeWorklistForItem(META, txns, [open('A', 0), open('B', 0)]);
    const a = rows.find((r) => r.locationNsId === 'A')!;
    expect(a.suspectType).toBe('InvTrnfr'); // never a non-editable type
    expect(['CLEAN', 'PARTIAL']).toContain(a.category);
  });

  it('validateWorklist passes for rule-compliant rows and flags violations', () => {
    const txns = [
      tx({ loc: 'A', date: '2024-08-01', qty: 100, code: 'ItemRcpt' }),
      tx({ tx: 'IT3', loc: 'A', date: '2024-08-06', qty: -130, code: 'InvTrnfr', group: 'IT3' }),
      tx({ tx: 'IT3', loc: 'B', date: '2024-08-06', qty: 130, code: 'InvTrnfr', group: 'IT3' }),
    ];
    const rows = computeWorklistForItem(META, txns, [open('A', 0), open('B', 0)]);
    const v = validateWorklist(rows);
    expect(v.nonEditable).toHaveLength(0);
    expect(v.closedPeriod).toHaveLength(0);

    // Inject a violation and confirm the checker catches it.
    const bad = [{ ...rows[0], suspectNsTransactionId: 'x', suspectType: 'Build', suspectDate: '2023-05-01' }];
    const v2 = validateWorklist(bad as any);
    expect(v2.nonEditable.length + v2.closedPeriod.length).toBeGreaterThan(0);
  });
});
