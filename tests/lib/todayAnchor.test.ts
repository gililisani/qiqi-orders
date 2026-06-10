import { describe, it, expect } from 'vitest';
import { applyTodayAnchor, buildPointCorrections, feedQohForItem } from '@/lib/inventory/todayAnchor';
import { computeLedger, type LedgerTxn, type OpeningBalance } from '@/lib/inventory/balanceEngine';
import { computeItemWindows } from '@/lib/inventory/negativeWindows';
import type { StockRow } from '@/lib/inventory/webQuery';

function tx(o: { id: string; date: string; qty: number; loc?: string; locName?: string }): LedgerTxn {
  return {
    id: o.id,
    nsTransactionId: o.id,
    lineId: '1',
    docNumber: o.id,
    tranDate: o.date,
    tranType: 'ADJ',
    nsTypeCode: 'InvAdjst',
    locationNsId: o.loc ?? 'L1',
    locationName: o.locName ?? 'Packable - Qiqi INC',
    signedQty: o.qty,
    transferGroup: null,
    transferLeg: null,
  };
}
const TODAY = '2026-06-10';

describe('applyTodayAnchor', () => {
  it('sets opening so the replay lands exactly on the feed QOH today', () => {
    const txns = [tx({ id: 'a', date: '2024-10-02', qty: -12 }), tx({ id: 'b', date: '2024-10-08', qty: 503 })];
    const feed = new Map([['packable  qiqi inc', 768]]); // tolerant name matching
    const openings = applyTodayAnchor(txns, [], feed, TODAY);
    expect(openings).toHaveLength(1);
    expect(openings[0].openingQty).toBe(768 - (-12 + 503)); // 277
    const ledger = computeLedger(txns, openings);
    expect(ledger.byLocation['L1'].final).toBe(768); // lands on trusted today
  });

  it('excludes future-dated transactions from the anchor sum', () => {
    const txns = [tx({ id: 'a', date: '2024-10-02', qty: 10 }), tx({ id: 'f', date: '2026-07-01', qty: -4 })];
    const openings = applyTodayAnchor(txns, [], new Map([['Packable - Qiqi INC', 6]]), TODAY);
    expect(openings[0].openingQty).toBe(-4); // 6 − 10; the July txn is not yet in today's QOH
  });

  it('treats a location missing from the feed as 0 today', () => {
    const txns = [tx({ id: 'a', date: '2024-01-01', qty: 50 })];
    const openings = applyTodayAnchor(txns, [], new Map(), TODAY);
    expect(openings[0].openingQty).toBe(-50); // unexplained → surfaces as nonzero opening
    expect(openings[0].currentQoh).toBe(0);
  });

  it('creates a lane for a feed location with no transactions at all', () => {
    const openings = applyTodayAnchor([], [], new Map([['DHL', -700]]), TODAY);
    expect(openings).toHaveLength(1);
    expect(openings[0]).toMatchObject({ locationNsId: 'DHL', openingQty: -700, currentQoh: -700 });
  });
});

describe('verified flags under the today-anchor', () => {
  const meta = { itemCode: 'X', nsItemId: '1', itemName: 'X' };

  it('fully-explained lane (opening 0) → historical window VERIFIED', () => {
    // -12 then +503: feed today = 491 → opening 0 → window is exact.
    const txns = [tx({ id: 'a', date: '2024-10-02', qty: -12 }), tx({ id: 'b', date: '2024-10-08', qty: 503 })];
    const openings = applyTodayAnchor(txns, [], new Map([['Packable - Qiqi INC', 491]]), TODAY);
    const ledger = computeLedger(txns, openings);
    const [w] = computeItemWindows(meta, ledger, { snapshotsApplied: true });
    expect(w.minBalance).toBe(-12);
    expect(w.verified).toBe(true);
  });

  it('unexplained residual (opening ≠ 0) → window APPROXIMATE until a trusted point anchors it', () => {
    const txns = [tx({ id: 'a', date: '2024-10-02', qty: -12 }), tx({ id: 'b', date: '2024-10-08', qty: 503 })];
    // feed says 496 today but txns sum to 491 → +5 residual placed at opening.
    const openings = applyTodayAnchor(txns, [], new Map([['Packable - Qiqi INC', 496]]), TODAY);
    const noPoint = computeLedger(txns, openings);
    const [w1] = computeItemWindows(meta, noPoint, { snapshotsApplied: true });
    expect(w1.verified).toBe(false);

    // A trusted point dated before the window start anchors it → verified.
    const corrections = buildPointCorrections(
      [{ itemCode: 'X', locationName: 'packable qiqi inc', asOfDate: '2024-09-30', qty: 5 }],
      txns,
      openings,
    );
    const withPoint = computeLedger(txns, openings, corrections);
    const [w2] = computeItemWindows(meta, withPoint, { snapshotsApplied: true });
    expect(w2.verified).toBe(true);
    // And the balance from the point forward is the trusted trajectory.
    expect(withPoint.byLocation['L1'].eodTimeline.find((p) => p.date === '2024-10-02')?.eod).toBe(-7);
  });
});

describe('feedQohForItem', () => {
  it('filters the feed case-insensitively by item code', () => {
    const feed: StockRow[] = [
      { itemCode: 'FPS0017', displayName: '', location: 'DHL', qoh: 156 },
      { itemCode: 'fps0017', displayName: '', location: 'Main', qoh: 0 },
      { itemCode: 'TOL0005', displayName: '', location: 'DHL', qoh: -700 },
    ];
    const m = feedQohForItem(feed, 'fps0017');
    expect([...m.entries()].sort()).toEqual([['DHL', 156], ['Main', 0]]);
  });
});
