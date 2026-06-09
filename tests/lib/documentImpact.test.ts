import { describe, expect, it } from 'vitest';
import { evaluateDocChange, findBestDate, planReduceToClearSource, recommendDoc, type DocumentContext, type DocItem } from '@/lib/inventory/documentImpact';
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

  // Regression for the IT10186 bug: a change that creates a NEW negative window
  // at a location ALREADY negative elsewhere in time must be flagged "created"
  // (the old whether-ever-negative comparison missed this and reported "clean").
  it('detects a NEW/ deepened negative window even when the location was already negative later', () => {
    const item: DocItem = {
      nsItemId: 'X',
      itemCode: 'ITEMX',
      itemName: 'X',
      transactions: [
        // PK starts fine; receives via DOC on 07-11 (+50), consumes 50 on 08-01 (net 0),
        // then is independently negative far later (2025) for an unrelated reason.
        tx({ tx: 'DOC', loc: 'SQ', date: '2024-07-11', qty: -50 }),
        tx({ tx: 'DOC', loc: 'PK', date: '2024-07-11', qty: 50 }),
        tx({ tx: 'CONS', loc: 'PK', date: '2024-08-01', qty: -50 }),
        tx({ tx: 'LATE', loc: 'PK', date: '2025-06-01', qty: -10 }), // pre-existing 2025 negative
        tx({ tx: 'RSQ', loc: 'SQ', date: '2024-07-05', qty: 50 }), // SQ has stock so DOC is fine where it is
      ],
      openings: [open('SQ'), open('PK')],
    };
    const ctx: DocumentContext = {
      docNumber: 'DOC', nsTransactionId: 'DOC', nsType: 'InvTrnfr', tranDate: '2024-07-11',
      legs: [], items: [item], itemCount: 1, locationNames: ['SQ', 'PK'],
    };
    // Move DOC later than the 08-01 consumption → PK goes negative Aug–later,
    // a NEW window even though PK was already negative in 2025.
    const impact = evaluateDocChange(ctx, { kind: 'changeDate', newDate: '2024-09-01' });
    expect(impact.created.some((c) => c.itemCode === 'ITEMX' && c.locationName === 'PK')).toBe(true);
    expect(impact.clean).toBe(false);
  });
});

describe('reduce-to-clear-source + ranked recommendation', () => {
  // SQ has only 30 of ITEMQ but the transfer ships 50 → SQ goes to -20.
  // Reducing the line to 30 clears SQ; PK then short 20 → compensating transfer.
  function buildReduceCtx(): DocumentContext {
    let s = 0;
    const t = (tx: string, loc: string, date: string, qty: number): LedgerTxn => ({
      id: `q${++s}`, nsTransactionId: tx, lineId: String(s), docNumber: tx, tranDate: date,
      tranType: qty >= 0 ? 'IR' : 'IF', nsTypeCode: qty >= 0 ? 'ItemRcpt' : 'ItemShip',
      locationNsId: loc, locationName: loc, signedQty: qty,
    });
    const item: DocItem = {
      nsItemId: 'Q', itemCode: 'ITEMQ', itemName: 'Q',
      transactions: [
        t('RQ', 'SQ', '2024-07-01', 30),
        t('DOC', 'SQ', '2024-07-11', -50),
        t('DOC', 'PK', '2024-07-11', 50),
        t('USE', 'PK', '2024-08-01', -50),
      ],
      openings: [
        { locationNsId: 'SQ', locationName: 'SQ', openingQty: 0 },
        { locationNsId: 'PK', locationName: 'PK', openingQty: 0 },
      ],
    };
    return { docNumber: 'DOC', nsTransactionId: 'DOC', nsType: 'InvTrnfr', tranDate: '2024-07-11', legs: [], items: [item], itemCount: 1, locationNames: ['SQ', 'PK'] };
  }

  it('reduces the line to what the source can spare and clears the source', () => {
    const plan = planReduceToClearSource(buildReduceCtx())!;
    const r = plan.reductions.find((x) => x.itemCode === 'ITEMQ')!;
    expect(r.originalQty).toBe(50);
    expect(r.newQty).toBe(30); // SQ had 30
    expect(plan.sourceCleared).toBe(true);
  });

  it('quantifies the destination compensating transfer for the shortfall', () => {
    const plan = planReduceToClearSource(buildReduceCtx())!;
    const c = plan.compensatingTransfers.find((x) => x.itemCode === 'ITEMQ' && x.destLocation === 'PK');
    expect(c?.needQty).toBe(20); // PK consumes 50 but only receives 30 now
  });

  it('recommendDoc prefers the source-clearing reduce when no date is clean', () => {
    const { recommendation } = recommendDoc(buildReduceCtx());
    expect(recommendation.strategy).toBe('reduceQty');
    expect(recommendation.sourceCleared).toBe(true);
    expect(recommendation.compensatingTransfers?.length).toBeGreaterThan(0);
  });
});
