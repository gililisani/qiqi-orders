import { describe, expect, it } from 'vitest';
import { assembleItem, type RawTxnLine, type RawQoh, type OpeningAnchor } from '@/lib/inventory/assemble';
import { computeLedger } from '@/lib/inventory/balanceEngine';

// Raw line helper (mimics the SuiteQL row shape assembleItem consumes).
function line(p: { tx: string; doc: string; date: string; type: string; loc: string; locName: string; qty: number }): RawTxnLine {
  return {
    tx_id: p.tx,
    doc: p.doc,
    trandate: p.date, // ISO; normalizeNsDate passes ISO through
    ns_type: p.type,
    ns_type_name: p.type,
    line_id: '1',
    location: p.loc,
    loc_name: p.locName,
    quantity: p.qty,
  };
}
const qoh = (loc: string, locName: string, q: number): RawQoh => ({ loc, loc_name: locName, qoh: q });

describe('assembleItem opening anchor', () => {
  // FPS0017-shaped: a real pre-cutoff opening. Snapshot says 1,134 on hand at
  // the cutoff; post-cutoff a shipment of 115 leaves 1,019.
  const lines: RawTxnLine[] = [
    line({ tx: 'PRE', doc: 'IT0', date: '2023-07-04', type: 'InvTrnfr', loc: '2', locName: 'DHL', qty: 1980 }), // pre-cutoff, should be dropped
    line({ tx: 'POST', doc: 'IF1', date: '2024-02-08', type: 'ItemShip', loc: '2', locName: 'DHL', qty: -115 }),
  ];
  const qohRows: RawQoh[] = [qoh('2', 'DHL', 1019)];

  it('zero-anchor (no snapshot): includes pre-cutoff txns, residual = QOH − Σall', () => {
    const a = assembleItem(lines, qohRows);
    const dhl = a.openings.find((o) => o.locationNsId === '2')!;
    expect(dhl.openingQty).toBe(0);
    const ledger = computeLedger(a.transactions, a.openings);
    expect(ledger.byLocation['2'].final).toBe(1980 - 115); // 1865
    // residual = 1019 − 1865 = −846
    expect(a.residuals.find((r) => r.locationNsId === '2')!.residual).toBe(-846);
  });

  it('snapshot anchor: opening from snapshot, pre-cutoff dropped, balances exact', () => {
    const anchor: OpeningAnchor = {
      cutoffDate: '2023-12-31',
      openingByLocName: new Map([['DHL', 1134]]),
    };
    const a = assembleItem(lines, qohRows, anchor);
    // pre-cutoff IT0 dropped → only the post-cutoff shipment remains
    expect(a.transactions).toHaveLength(1);
    expect(a.transactions[0].docNumber).toBe('IF1');
    const dhl = a.openings.find((o) => o.locationNsId === '2')!;
    expect(dhl.openingQty).toBe(1134);
    const ledger = computeLedger(a.transactions, a.openings);
    expect(ledger.byLocation['2'].final).toBe(1134 - 115); // 1019 = NS QOH
    // reconstructed final matches QOH → residual 0
    expect(a.residuals.find((r) => r.locationNsId === '2')).toBeUndefined();
  });

  it('snapshot with no row for a location defaults that location to opening 0', () => {
    const anchor: OpeningAnchor = { cutoffDate: '2023-12-31', openingByLocName: new Map() };
    const a = assembleItem(lines, qohRows, anchor);
    expect(a.openings.find((o) => o.locationNsId === '2')!.openingQty).toBe(0);
    // only post-cutoff txn kept: final = -115; residual = 1019 − (−115) = 1134
    expect(a.residuals.find((r) => r.locationNsId === '2')!.residual).toBe(1134);
  });
});
