import { describe, expect, it } from 'vitest';
import { evaluateDocChange, findBestDate, type DocumentContext, type DocItem } from '@/lib/inventory/documentImpact';
import type { LedgerTxn, OpeningBalance } from '@/lib/inventory/balanceEngine';

let seq = 0;
function tx(p: { tx: string; loc: string; date: string; qty: number }): LedgerTxn {
  seq += 1;
  return {
    id: `r${seq}`,
    nsTransactionId: p.tx,
    lineId: String(seq),
    docNumber: p.tx,
    tranDate: p.date,
    tranType: p.qty >= 0 ? 'IR' : 'IF',
    nsTypeCode: p.qty >= 0 ? 'ItemRcpt' : 'ItemShip',
    locationNsId: p.loc,
    locationName: p.loc,
    signedQty: p.qty,
  };
}
const open = (loc: string): OpeningBalance => ({ locationNsId: loc, locationName: loc, openingQty: 0 });

// Two items both moved by transfer "DOC" (Square1 → Packable) on 2024-07-11.
// Item A: Square1 has stock; transfer is fine; deleting it would leave Packable
// short later. Item B: Square1 has NO stock on 07-11 (driven negative by the
// transfer); a receipt arrives 07-20 — so moving the transfer later fixes B.
function buildCtx(): DocumentContext {
  const A: DocItem = {
    nsItemId: 'A',
    itemCode: 'ITEMA',
    itemName: 'A',
    transactions: [
      tx({ tx: 'RA', loc: 'SQ', date: '2024-07-01', qty: 100 }),
      tx({ tx: 'DOC', loc: 'SQ', date: '2024-07-11', qty: -50 }),
      tx({ tx: 'DOC', loc: 'PK', date: '2024-07-11', qty: 50 }),
      tx({ tx: 'SHIPA', loc: 'PK', date: '2024-08-01', qty: -50 }), // Packable consumes it later
    ],
    openings: [open('SQ'), open('PK')],
  };
  const B: DocItem = {
    nsItemId: 'B',
    itemCode: 'ITEMB',
    itemName: 'B',
    transactions: [
      tx({ tx: 'DOC', loc: 'SQ', date: '2024-07-11', qty: -40 }), // drives SQ to -40
      tx({ tx: 'DOC', loc: 'PK', date: '2024-07-11', qty: 40 }),
      tx({ tx: 'RB', loc: 'SQ', date: '2024-07-20', qty: 40 }), // stock actually arrives 07-20
    ],
    openings: [open('SQ'), open('PK')],
  };
  return {
    docNumber: 'DOC',
    nsTransactionId: 'DOC',
    nsType: 'InvTrnfr',
    tranDate: '2024-07-11',
    legs: [],
    items: [A, B],
    itemCount: 2,
    locationNames: ['SQ', 'PK'],
  };
}

describe('document impact — multi-item', () => {
  it('delete: clears B@SQ but breaks A@PK (collateral across items)', () => {
    const ctx = buildCtx();
    const impact = evaluateDocChange(ctx, { kind: 'delete' });
    expect(impact.fixed.some((f) => f.itemCode === 'ITEMB' && f.locationName === 'SQ')).toBe(true);
    expect(impact.created.some((c) => c.itemCode === 'ITEMA' && c.locationName === 'PK')).toBe(true);
    expect(impact.clean).toBe(false);
  });

  it('moving the transfer to 2024-07-20 fixes B@SQ with no collateral (clean)', () => {
    const ctx = buildCtx();
    const impact = evaluateDocChange(ctx, { kind: 'changeDate', newDate: '2024-07-20' });
    expect(impact.clean).toBe(true);
    expect(impact.created).toHaveLength(0);
  });

  it('findBestDate locates the earliest clean date across all items', () => {
    const ctx = buildCtx();
    const { cleanDate } = findBestDate(ctx);
    expect(cleanDate).toBe('2024-07-20');
  });

  it('quantifies adjustments when a change leaves something negative', () => {
    const ctx = buildCtx();
    const impact = evaluateDocChange(ctx, { kind: 'delete' });
    // A@PK newly negative by 50 → adjustment +50 suggested
    const adj = impact.adjustments.find((a) => a.itemCode === 'ITEMA' && a.locationName === 'PK');
    expect(adj?.addQty).toBe(50);
  });
});
