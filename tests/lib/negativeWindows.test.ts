import { describe, expect, it } from 'vitest';
import { computeLedger, type LedgerTxn, type OpeningBalance } from '@/lib/inventory/balanceEngine';
import { computeItemWindows, type WindowItemMeta } from '@/lib/inventory/negativeWindows';

const META: WindowItemMeta = { itemCode: 'TEST', nsItemId: '1', itemName: 'Test' };
const open = (loc: string, qty: number): OpeningBalance => ({ locationNsId: loc, locationName: `Loc-${loc}`, openingQty: qty });

let seq = 0;
function tx(p: { loc: string; date: string; qty: number; code: string }): LedgerTxn {
  seq += 1;
  return {
    id: `r${seq}`,
    nsTransactionId: `t${seq}`,
    lineId: String(seq),
    docNumber: `DOC${seq}`,
    tranDate: p.date,
    tranType: p.code === 'Build' ? 'BUILD' : p.code === 'InvTrnfr' ? 'IT' : p.code === 'ItemShip' ? 'IF' : 'IR',
    nsTypeCode: p.code,
    locationNsId: p.loc,
    locationName: `Loc-${p.loc}`,
    signedQty: p.qty,
  };
}
const windows = (txns: LedgerTxn[], openings: OpeningBalance[]) =>
  computeItemWindows(META, computeLedger(txns, openings));

describe('computeItemWindows — detection + tiering', () => {
  it('TIER 1 toxic: ongoing window with an Assembly Build during', () => {
    const w = windows(
      [tx({ loc: 'A', date: '2024-01-01', qty: 50, code: 'ItemRcpt' }), tx({ loc: 'A', date: '2024-02-01', qty: -80, code: 'Build' })],
      [open('A', 0)],
    );
    expect(w).toHaveLength(1);
    expect(w[0].status).toBe('Ongoing');
    expect(w[0].tier).toBe(1);
    expect(w[0].buildsDuring).toBe(1);
    expect(w[0].minBalance).toBe(-30);
  });

  it('TIER 2 compounding: ongoing, no build, an outbound transfer during', () => {
    const w = windows(
      [tx({ loc: 'A', date: '2024-01-01', qty: 50, code: 'ItemRcpt' }), tx({ loc: 'A', date: '2024-02-01', qty: -80, code: 'InvTrnfr' })],
      [open('A', 0)],
    );
    expect(w[0].tier).toBe(2);
    expect(w[0].buildsDuring).toBe(0);
    expect(w[0].otherOutboundDuring).toBe(1);
  });

  it('TIER 3 dormant: ongoing, negative from opening, no outbound after', () => {
    const w = windows([tx({ loc: 'A', date: '2024-02-01', qty: 10, code: 'ItemRcpt' })], [open('A', -50)]);
    expect(w[0].tier).toBe(3);
    expect(w[0].status).toBe('Ongoing');
  });

  it('TIER 4 historical: a recovered (closed) window, regardless of activity', () => {
    const w = windows(
      [
        tx({ loc: 'A', date: '2024-01-01', qty: 50, code: 'ItemRcpt' }),
        tx({ loc: 'A', date: '2024-02-01', qty: -80, code: 'InvTrnfr' }),
        tx({ loc: 'A', date: '2024-03-01', qty: 50, code: 'ItemRcpt' }),
      ],
      [open('A', 0)],
    );
    expect(w[0].status).toBe('Closed');
    expect(w[0].tier).toBe(4);
    expect(w[0].end).toBe('2024-03-01');
  });

  it('crossedClosedPeriod: ongoing window that spans a year boundary', () => {
    const w = windows(
      [tx({ loc: 'A', date: '2024-11-01', qty: 10, code: 'ItemRcpt' }), tx({ loc: 'A', date: '2024-11-02', qty: -30, code: 'InvTrnfr' }), tx({ loc: 'A', date: '2025-02-01', qty: 5, code: 'ItemRcpt' })],
      [open('A', 0)],
    );
    expect(w[0].crossedClosedPeriod).toBe(true);
  });
});
