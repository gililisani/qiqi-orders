import { describe, it, expect } from 'vitest';
import {
  reconcileWorklistWithFeed,
  reconcileKey,
  normalizeLocationName,
} from '@/lib/inventory/feedReconcile';
import type { WorklistRow } from '@/lib/inventory/worklist';
import type { StockRow } from '@/lib/inventory/webQuery';

function row(over: Partial<WorklistRow>): WorklistRow {
  return {
    itemCode: 'X',
    nsItemId: '1',
    itemName: 'X',
    locationNsId: 'L1',
    locationName: 'Loc',
    depth: -5,
    since: '2024-03-01',
    tier: 2,
    recommendationType: 'Change date',
    category: 'CLEAN',
    editsRequired: [],
    prerequisiteSummary: 'None',
    isBrokenChain: false,
    notes: '',
    options: [],
    suspectNsTransactionId: null,
    suspectDoc: null,
    suspectType: null,
    suspectDate: null,
    ...over,
  };
}
function feed(itemCode: string, location: string, qoh: number): StockRow {
  return { itemCode, location, qoh, displayName: itemCode };
}

describe('key helpers', () => {
  it('normalizes location names tolerantly', () => {
    expect(normalizeLocationName('Packable - Qiqi GLOBAL')).toBe('packable qiqi global');
    expect(normalizeLocationName('packable   qiqi  global')).toBe('packable qiqi global');
  });
  it('builds a case/space-insensitive composite key', () => {
    expect(reconcileKey(' fps0020 ', 'Square1 - Missouri')).toBe('FPS0020|square1 missouri');
  });
});

describe('reconcileWorklistWithFeed', () => {
  const ongoingAll = () => true;

  it('CONFIRMED: trusts the feed depth over the engine depth', () => {
    const r = reconcileWorklistWithFeed({
      rows: [row({ itemCode: 'FPS0020', locationName: 'Square1 - Missouri', depth: -999 })],
      feed: [feed('FPS0020', 'square1 missouri', -60)],
      isOngoing: ongoingAll,
      buildFeedOnlyRow: () => row({}),
    });
    expect(r.summary.confirmed).toBe(1);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].depth).toBe(-60); // feed wins
  });

  it('FALSE POSITIVE: drops an ongoing engine negative the feed says is fine now', () => {
    const r = reconcileWorklistWithFeed({
      rows: [row({ itemCode: 'FPS0099', locationName: 'DHL', depth: -12 })],
      feed: [feed('FPS0099', 'DHL', 40)], // positive now
      isOngoing: ongoingAll,
      buildFeedOnlyRow: () => row({}),
    });
    expect(r.summary.falsePositive).toBe(1);
    expect(r.rows).toHaveLength(0);
    expect(r.falsePositives[0]).toMatchObject({ itemCode: 'FPS0099', engineDepth: -12 });
  });

  it('UNMATCHED: keeps + flags an ongoing negative the feed has no row for', () => {
    const r = reconcileWorklistWithFeed({
      rows: [row({ itemCode: 'ZZZ', locationName: 'Nowhere', depth: -3 })],
      // feed has an unrelated NON-negative row, so nothing gets surfaced;
      // isolates the "engine negative the feed can't speak to" case.
      feed: [feed('FPS0020', 'Square1 - Missouri', 100)],
      isOngoing: ongoingAll,
      buildFeedOnlyRow: () => row({}),
    });
    expect(r.summary.unmatched).toBe(1);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].depth).toBe(-3); // engine depth retained
    expect(r.rows[0].notes).toMatch(/Not found in the trusted/i);
  });

  it('FEED_ONLY: surfaces a feed negative the engine never produced a row for', () => {
    const built = row({ itemCode: 'COM0067', locationName: 'Main', depth: -22946, category: 'MANUAL' });
    const r = reconcileWorklistWithFeed({
      rows: [],
      feed: [feed('COM0067', 'Main', -22946), feed('COM0048', 'ProPack', 33981)],
      isOngoing: ongoingAll,
      buildFeedOnlyRow: () => built,
    });
    expect(r.summary.feedOnly).toBe(1); // only the negative; the positive is ignored
    expect(r.feedOnly[0].itemCode).toBe('COM0067');
    expect(r.rows).toEqual([built]);
  });

  it('leaves closed/historical rows untouched (feed only judges NOW)', () => {
    const closed = row({ itemCode: 'OLD', locationName: 'DHL', depth: -100, tier: 4, since: '2023-05-01' });
    const r = reconcileWorklistWithFeed({
      rows: [closed],
      feed: [feed('OLD', 'DHL', 0)], // would be a false-positive IF it were ongoing
      isOngoing: () => false, // not ongoing
      buildFeedOnlyRow: () => row({}),
    });
    expect(r.summary).toEqual({ confirmed: 0, falsePositive: 0, feedOnly: 0, unmatched: 0 });
    expect(r.rows).toEqual([closed]);
  });
});
