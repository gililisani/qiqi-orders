import { describe, it, expect } from 'vitest';
import { computeLedger, type LedgerTxn, type OpeningBalance, type CorrectionMap } from '@/lib/inventory/balanceEngine';

function tx(over: Partial<LedgerTxn> & { tranDate: string; signedQty: number; id: string }): LedgerTxn {
  return {
    nsTransactionId: over.id,
    lineId: '1',
    docNumber: over.id,
    tranType: 'ADJ',
    locationNsId: 'L1',
    locationName: 'Loc 1',
    transferGroup: null,
    transferLeg: null,
    ...over,
  };
}
const opening = (qty: number): OpeningBalance[] => [
  { locationNsId: 'L1', locationName: 'Loc 1', openingQty: qty, currentQoh: qty },
];

describe('computeLedger re-anchoring + validation', () => {
  // FPS0017-shaped: trusted +5 anchor, then outbound drives it negative.
  const txns = [
    tx({ id: 't1', tranDate: '2024-10-02', signedQty: -12 }), // 5 -> -7
    tx({ id: 't2', tranDate: '2024-10-06', signedQty: -9 }), //  -7 -> -16
    tx({ id: 't3', tranDate: '2024-10-08', signedQty: 503 }), // -16 -> 487
  ];

  it('anchors at the opening and reproduces the trajectory', () => {
    const ledger = computeLedger(txns, opening(5));
    const tl = ledger.byLocation['L1'].eodTimeline;
    expect(tl.find((p) => p.date === '2024-10-02')?.eod).toBe(-7);
    expect(tl.find((p) => p.date === '2024-10-06')?.eod).toBe(-16);
    expect(ledger.byLocation['L1'].unverifiedSegments).toEqual([]);
  });

  it('re-anchors to a trusted snapshot and flags an unreconciled segment', () => {
    // A trusted snapshot on 10-31 says 600, but replay reaches 487 (gap +113):
    // NetSuite has movements we can't see → record an unverified segment, and
    // the eod on the snapshot date becomes the trusted value.
    const corrections: CorrectionMap = new Map([['L1', [{ date: '2024-10-31', qty: 600 }]]]);
    const ledger = computeLedger(txns, opening(5), corrections);
    const lane = ledger.byLocation['L1'];
    expect(lane.eodTimeline.find((p) => p.date === '2024-10-31')?.eod).toBe(600);
    expect(lane.final).toBe(600);
    expect(lane.unverifiedSegments).toEqual([{ from: '2024-10-02', to: '2024-10-31', gap: 113 }]);
  });

  it('records NO unverified segment when replay reconciles exactly', () => {
    // Replay reaches 487 on 10-08; a trusted snapshot of 487 on 10-31 matches.
    const corrections: CorrectionMap = new Map([['L1', [{ date: '2024-10-31', qty: 487 }]]]);
    const ledger = computeLedger(txns, opening(5), corrections);
    expect(ledger.byLocation['L1'].unverifiedSegments).toEqual([]);
    expect(ledger.byLocation['L1'].final).toBe(487);
  });

  it('applies a correction on a date with no transactions', () => {
    const corrections: CorrectionMap = new Map([['L1', [{ date: '2024-12-31', qty: 1000 }]]]);
    const ledger = computeLedger(txns, opening(5), corrections);
    const tl = ledger.byLocation['L1'].eodTimeline;
    expect(tl[tl.length - 1]).toMatchObject({ date: '2024-12-31', eod: 1000 });
  });

  it('is unchanged vs no-corrections when corrections is undefined', () => {
    const a = computeLedger(txns, opening(5));
    const b = computeLedger(txns, opening(5), new Map());
    expect(b.byLocation['L1'].eodTimeline).toEqual(a.byLocation['L1'].eodTimeline);
    expect(a.byLocation['L1'].unverifiedSegments).toEqual([]);
  });
});
