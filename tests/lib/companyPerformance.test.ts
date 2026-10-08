import { describe, it, expect } from 'vitest';
import {
  buildFirstDoneMap,
  buildSfUsedByOrder,
  computeCompanyMetrics,
  computePeriodMetrics,
  computeSfBehaviorDistribution,
  type EntryProductLine,
  type SalesEntry,
} from '@/lib/companyPerformance';

const NOW = new Date('2026-07-15T12:00:00Z');

const COMPANY = {
  id: 'c1',
  company_name: 'Evolve',
  netsuite_number: 'C1001',
  support_fund_id: 'sf1',
  support_fund: { percent: 10 },
  subsidiary: { name: 'Qiqi INC.' },
};

const PERIODS = [
  { id: 'p1', period_name: 'Year 1', start_date: '2025-07-01', end_date: '2026-06-30', target_amount: 100000 },
  { id: 'p2', period_name: 'Year 2', start_date: '2026-07-01', end_date: '2027-06-30', target_amount: 130000 },
];

const entry = (o: Partial<SalesEntry> & Pick<SalesEntry, 'day' | 'amount'>): SalesEntry => ({
  company_id: 'c1',
  source: 'hub_order',
  order_id: null,
  document_id: null,
  sf_earned: 0,
  sf_used: 0,
  ...o,
});

// The sales_entries view, as the module receives it.
const ENTRIES: SalesEntry[] = [
  entry({ day: '2025-08-10', source: 'billed_externally', document_id: 'inv1', amount: 40000, sf_earned: 900, sf_used: 900 }),
  entry({ day: '2025-08-10', source: 'credit', document_id: 'cm1', amount: -1000 }), // credit on inv1
  entry({ day: '2026-03-05', order_id: 'o1', amount: 70000, sf_earned: 7000, sf_used: 6000 }),
  entry({ day: '2026-03-05', source: 'credit', order_id: 'o1', document_id: 'cm2', amount: -500 }), // credit on o1
  entry({ day: '2026-07-10', order_id: 'o2', amount: 20000, sf_earned: 2000, sf_used: 2500 }), // topped up
  entry({ day: '2026-07-20', source: 'credit', document_id: 'cm3', amount: -300 }), // company credit
];

const PRODUCT_LINES: EntryProductLine[] = [
  { day: '2026-07-10', product_id: 1, sku: 'FPS0018', name: 'Shampoo', quantity: 10, amount: 12000 },
  { day: '2026-07-10', product_id: 2, sku: 'FPS0030', name: 'Masque', quantity: 5, amount: 8000 },
  { day: '2026-07-20', product_id: 1, sku: 'FPS0018', name: 'Shampoo', quantity: -1, amount: -300 }, // credited
  { day: '2025-08-10', product_id: 1, sku: 'FPS0018', name: 'Shampoo', quantity: 99, amount: 40000 }, // outside the window
];

function build(windowFrom: Date, windowTo: Date) {
  return computeCompanyMetrics({
    now: NOW,
    company: COMPANY,
    periods: PERIODS,
    entries: ENTRIES,
    productLines: PRODUCT_LINES,
    windowFrom,
    windowTo,
  });
}

describe('computeCompanyMetrics (sales entries)', () => {
  const result = build(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-31T23:59:59Z'));

  it('to date = every entry; orders = Hub orders + invoices billed externally', () => {
    expect(result.toDate.sales).toBe(128200); // 40000 − 1000 + 70000 − 500 + 20000 − 300
    expect(result.toDate.orders).toBe(3);
    expect(result.toDate.sfEarned).toBe(9900);
    expect(result.toDate.sfUsed).toBe(9400);
    expect(result.toDate.sfBalance).toBe(500);
  });

  it('attributes entries to periods by their day; credits reduce the period they land in', () => {
    const year1 = result.periods.find((p) => p.periodName === 'Year 1')!;
    expect(year1.actual).toBe(108500); // 39000 + 69500
    expect(year1.status).toBe('Complete');
    expect(year1.sfEarned).toBe(7900);
    expect(year1.sfUsed).toBe(6900);

    const year2 = result.periods.find((p) => p.periodName === 'Year 2')!;
    expect(year2.actual).toBe(19700); // 20000 − 300 company credit
    expect(year2.sfBalance).toBe(-500); // topped up
  });

  it('windows sales, orders, units and the product mix (credited products subtract)', () => {
    expect(result.window.sales).toBe(19700);
    expect(result.window.orders).toBe(1);
    expect(result.window.units).toBe(14);
    expect(result.window.topProducts[0]).toMatchObject({ sku: 'FPS0018', units: 9, revenue: 11700 });
    expect(result.window.productCount).toBe(2);
    expect(result.window.sfEarned).toBe(2000);
    expect(result.window.sfUsed).toBe(2500);
  });

  it('reports the agreement span from first to last period', () => {
    expect(result.company.agreementStart).toBe('2025-07-01');
    expect(result.company.agreementEnd).toBe('2027-06-30');
    expect(result.company.sfPercent).toBe(10);
  });
});

describe('computePeriodMetrics', () => {
  it('active period ahead of schedule → Ahead, with day/pace math', () => {
    // Year 2 started 2026-07-01; NOW is 15 days in.
    const m = computePeriodMetrics(NOW, { start_date: '2026-07-01', end_date: '2027-06-30', target_amount: 130000 }, ENTRIES);
    expect(m.actual).toBe(19700);
    expect(m.daysTotal).toBe(365);
    expect(m.daysElapsed).toBe(15);
    expect(m.daysRemaining).toBe(350);
    expect(m.progressPct).toBeCloseTo(15.15, 1);
    expect(m.expectedPct).toBeCloseTo(4.11, 1);
    expect(m.paceDeltaPct).toBeCloseTo(m.progressPct - m.expectedPct, 6);
    expect(m.status).toBe('Ahead');
  });

  it('ended period with target met → Complete; days fully elapsed', () => {
    const m = computePeriodMetrics(NOW, { start_date: '2025-07-01', end_date: '2026-06-30', target_amount: 100000 }, ENTRIES);
    expect(m.status).toBe('Complete');
    expect(m.daysElapsed).toBe(m.daysTotal);
    expect(m.daysRemaining).toBe(0);
    expect(m.expectedPct).toBe(100);
  });

  it('ended period with target missed → Fail, never Slipping', () => {
    const m = computePeriodMetrics(NOW, { start_date: '2025-07-01', end_date: '2026-06-30', target_amount: 200000 }, ENTRIES);
    expect(m.status).toBe('Fail');
  });

  it('future period → Not Started with zero elapsed', () => {
    const m = computePeriodMetrics(NOW, { start_date: '2027-07-01', end_date: '2028-06-30', target_amount: 50000 }, ENTRIES);
    expect(m.status).toBe('Not Started');
    expect(m.daysElapsed).toBe(0);
    expect(m.actual).toBe(0);
  });

  it('active period far behind schedule → Slipping', () => {
    const m = computePeriodMetrics(NOW, { start_date: '2026-01-01', end_date: '2026-12-31', target_amount: 1000000 }, ENTRIES);
    expect(m.actual).toBe(89200);
    expect(m.status).toBe('Slipping');
  });

  it('period boundaries are inclusive calendar days', () => {
    const m = computePeriodMetrics(NOW, { start_date: '2026-07-10', end_date: '2026-07-20', target_amount: 1 }, ENTRIES);
    expect(m.actual).toBe(19700);
  });
});

describe('computeSfBehaviorDistribution', () => {
  const ENROLLED = [{ company_id: 'c1', start_date: '2025-07-01', end_date: '2026-06-30' }];
  const E: SalesEntry[] = [
    entry({ day: '2025-09-01', order_id: 'a', amount: 1, sf_earned: 800, sf_used: 800 }), // fully redeemed
    entry({ day: '2025-10-01', order_id: 'b', amount: 1, sf_earned: 1400, sf_used: 1200 }), // leftover 200
    entry({ day: '2026-01-01', order_id: 'c', amount: 1, sf_earned: 100, sf_used: 300 }), // topped up 200
    entry({ day: '2026-08-01', order_id: 'd', amount: 1, sf_earned: 500 }), // outside the period
    entry({ company_id: 'c2', day: '2025-09-01', order_id: 'e', amount: 1, sf_earned: 500 }), // not enrolled
    entry({ day: '2025-11-01', order_id: 'f', amount: 1 }), // no signal
    entry({ day: '2025-12-01', source: 'billed_externally', document_id: 'x', amount: 1, sf_earned: 90, sf_used: 90 }), // unknowable → left out
  ];

  it('classifies Hub orders inside enrolled periods; invoices billed externally are left out', () => {
    const d = computeSfBehaviorDistribution(ENROLLED, E);
    expect(d.sampleSize).toBe(3);
    expect(d.fullyRedeemedPct).toBeCloseTo(33.33, 1);
    expect(d.underRedeemedPct).toBeCloseTo(33.33, 1);
    expect(d.toppedUpPct).toBeCloseTo(33.33, 1);
    expect(d.avgLeftover).toBeCloseTo(200, 6);
    expect(d.avgTopUp).toBeCloseTo(200, 6);
  });

  it('returns all zeros for an empty sample', () => {
    expect(computeSfBehaviorDistribution([], [])).toEqual({
      underRedeemedPct: 0,
      fullyRedeemedPct: 0,
      toppedUpPct: 0,
      avgTopUp: 0,
      avgLeftover: 0,
      sampleSize: 0,
    });
  });
});

describe('buildFirstDoneMap (order-based Support Funds report)', () => {
  it('keeps the EARLIEST Done timestamp when an order was marked Done twice', () => {
    const map = buildFirstDoneMap([
      { order_id: 'o1', created_at: '2026-01-01T10:00:00Z' },
      { order_id: 'o1', created_at: '2026-03-01T10:00:00Z' },
      { order_id: 'o2', created_at: '2026-02-01T10:00:00Z' },
    ]);
    expect(map.get('o1')).toEqual(new Date('2026-01-01T10:00:00Z'));
    expect(map.get('o2')).toEqual(new Date('2026-02-01T10:00:00Z'));
    expect(map.size).toBe(2);
  });
});

describe('buildSfUsedByOrder (order-based Support Funds report)', () => {
  it('sums SF line items per order', () => {
    const map = buildSfUsedByOrder([
      { order_id: 'o2', total_price: 900 },
      { order_id: 'o2', total_price: 300 },
      { order_id: 'o3', total_price: 500 },
    ]);
    expect(map.get('o2')).toBe(1200);
    expect(map.get('o3')).toBe(500);
    expect(map.has('o1')).toBe(false);
  });
});
