import { describe, it, expect } from 'vitest';
import {
  buildFirstDoneMap,
  buildSfUsedByOrder,
  computeCompanyMetrics,
  computePeriodMetrics,
  computeSfBehaviorDistribution,
} from '@/lib/companyPerformance';

const NOW = new Date('2026-07-15T12:00:00Z');

const COMPANY = {
  id: 'c1',
  company_name: 'Evolve',
  netsuite_number: 'C1001',
  support_fund_id: 'sf1',
  subsidiary: { name: 'Qiqi INC.' },
};

const PERIODS = [
  { id: 'p1', period_name: 'Year 1', start_date: '2025-07-01', end_date: '2026-06-30', target_amount: 100000 },
  { id: 'p2', period_name: 'Year 2', start_date: '2026-07-01', end_date: '2027-06-30', target_amount: 130000 },
];

const DONE_ORDERS = [
  { id: 'o1', total_value: 40000, credit_earned: 800 },
  { id: 'o2', total_value: 70000, credit_earned: 1400 }, // done in Year 1
  { id: 'o3', total_value: 20000, credit_earned: 400 },  // done in Year 2 window
  { id: 'o4', total_value: 9999, credit_earned: 0 },     // Done status but NO history → excluded
];

const FIRST_DONE = new Map<string, Date>([
  ['o1', new Date('2025-09-10T10:00:00Z')],
  ['o2', new Date('2026-03-05T10:00:00Z')],
  ['o3', new Date('2026-07-10T10:00:00Z')],
]);

const HISTORICAL = [
  { amount: 5000, sale_date: '2025-08-15' }, // inside Year 1
  { amount: 1234, sale_date: '2024-01-01' }, // before any period — to-date only
];

const SF_ITEMS = [
  { order_id: 'o2', total_price: 900 },
  { order_id: 'o2', total_price: 300 },
  { order_id: 'o3', total_price: 500 },
];

const PRODUCT_ITEMS = [
  { order_id: 'o3', product_id: 1, quantity: 10, total_price: 12000, product: { sku: 'FPS0018', item_name: 'Shampoo' } },
  { order_id: 'o3', product_id: 2, quantity: 5, total_price: 8000, product: { sku: 'FPS0030', item_name: 'Masque' } },
  { order_id: 'o1', product_id: 1, quantity: 99, total_price: 40000, product: { sku: 'FPS0018', item_name: 'Shampoo' } }, // outside window
];

function build(windowFrom: Date, windowTo: Date) {
  return computeCompanyMetrics({
    now: NOW,
    company: COMPANY,
    periods: PERIODS,
    doneOrders: DONE_ORDERS,
    firstDone: FIRST_DONE,
    historical: HISTORICAL,
    sfItems: SF_ITEMS,
    productItems: PRODUCT_ITEMS,
    windowFrom,
    windowTo,
  });
}

describe('computeCompanyMetrics', () => {
  const result = build(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-31T23:59:59Z'));

  it('computes to-date totals from Done orders + historical, excluding orders without a Done timestamp', () => {
    // 40000 + 70000 + 20000 (o4 excluded) + 5000 + 1234 historical
    expect(result.toDate.sales).toBe(136234);
    expect(result.toDate.orders).toBe(3);
    expect(result.toDate.sfEarned).toBe(2600);
    expect(result.toDate.sfUsed).toBe(1700);
    expect(result.toDate.sfBalance).toBe(900);
  });

  it('attributes actuals to periods by first-Done date + historical by sale date', () => {
    const year1 = result.periods.find((p) => p.periodName === 'Year 1')!;
    expect(year1.actual).toBe(115000); // 40000 + 70000 + 5000 historical
    expect(year1.status).toBe('Complete'); // period over, target met
    expect(year1.sfEarned).toBe(2200);
    expect(year1.sfUsed).toBe(1200);

    const year2 = result.periods.find((p) => p.periodName === 'Year 2')!;
    expect(year2.actual).toBe(20000);
    expect(year2.sfBalance).toBe(-100); // earned 400, claimed 500 → top-up
  });

  it('windows sales, units, and top products by Done date', () => {
    expect(result.window.sales).toBe(20000); // only o3
    expect(result.window.orders).toBe(1);
    expect(result.window.units).toBe(15);
    expect(result.window.topProducts[0]).toMatchObject({ sku: 'FPS0018', units: 10, revenue: 12000 });
    expect(result.window.productCount).toBe(2);
  });

  it('reports agreement span from first to last period', () => {
    expect(result.company.agreementStart).toBe('2025-07-01');
    expect(result.company.agreementEnd).toBe('2027-06-30');
  });

  it('a wider window picks up more orders and historical rows', () => {
    const wide = build(new Date('2025-01-01T00:00:00Z'), new Date('2026-12-31T23:59:59Z'));
    expect(wide.window.orders).toBe(3);
    expect(wide.window.sales).toBe(135000); // 130000 orders + 5000 historical
    // o1's 99 units now included
    expect(wide.window.units).toBe(114);
    expect(wide.window.topProducts[0]).toMatchObject({ sku: 'FPS0018', units: 109 });
  });
});

describe('computePeriodMetrics', () => {
  const SF_USED = buildSfUsedByOrder(SF_ITEMS);

  it('active period ahead of schedule → Ahead, with day/pace math', () => {
    // Year 2 started 2026-07-01; NOW is 15 days in.
    const m = computePeriodMetrics(
      NOW,
      { start_date: '2026-07-01', end_date: '2027-06-30', target_amount: 130000 },
      DONE_ORDERS,
      FIRST_DONE,
      SF_USED,
      HISTORICAL
    );
    expect(m.actual).toBe(20000); // only o3 done in range
    expect(m.daysTotal).toBe(365);
    expect(m.daysElapsed).toBe(15);
    expect(m.daysRemaining).toBe(350);
    expect(m.progressPct).toBeCloseTo(15.38, 1);
    expect(m.expectedPct).toBeCloseTo(4.11, 1);
    expect(m.paceDeltaPct).toBeCloseTo(m.progressPct - m.expectedPct, 6);
    expect(m.status).toBe('Ahead');
    expect(m.sfEarned).toBe(400);
    expect(m.sfUsed).toBe(500);
    expect(m.sfBalance).toBe(-100); // top-up
  });

  it('ended period with target met → Complete; days fully elapsed', () => {
    const m = computePeriodMetrics(
      NOW,
      { start_date: '2025-07-01', end_date: '2026-06-30', target_amount: 100000 },
      DONE_ORDERS,
      FIRST_DONE,
      SF_USED,
      HISTORICAL
    );
    expect(m.actual).toBe(115000); // o1 + o2 + 5000 historical
    expect(m.status).toBe('Complete');
    expect(m.daysElapsed).toBe(m.daysTotal);
    expect(m.daysRemaining).toBe(0);
    expect(m.expectedPct).toBe(100);
  });

  it('ended period with target missed → Fail, never Slipping', () => {
    const m = computePeriodMetrics(
      NOW,
      { start_date: '2025-07-01', end_date: '2026-06-30', target_amount: 200000 },
      DONE_ORDERS,
      FIRST_DONE,
      SF_USED,
      HISTORICAL
    );
    expect(m.status).toBe('Fail');
  });

  it('future period → Not Started with zero elapsed', () => {
    const m = computePeriodMetrics(
      NOW,
      { start_date: '2027-07-01', end_date: '2028-06-30', target_amount: 50000 },
      DONE_ORDERS,
      FIRST_DONE,
      SF_USED,
      HISTORICAL
    );
    expect(m.status).toBe('Not Started');
    expect(m.daysElapsed).toBe(0);
    expect(m.expectedPct).toBe(0);
    expect(m.actual).toBe(0);
  });

  it('active period far behind schedule → Slipping', () => {
    // Covers o2 (70000, done 2026-03-05) + o3 (20000, done 2026-07-10),
    // but the target is huge.
    const m = computePeriodMetrics(
      NOW,
      { start_date: '2026-01-01', end_date: '2026-12-31', target_amount: 1000000 },
      DONE_ORDERS,
      FIRST_DONE,
      SF_USED,
      HISTORICAL
    );
    expect(m.actual).toBe(90000);
    expect(m.progressPct).toBe(9);
    // ~196 of 365 days elapsed → expected ~53.7%; 9 < 33.7 → Slipping
    expect(m.status).toBe('Slipping');
  });

  it('excludes Done orders that have no first-Done timestamp', () => {
    // o4 (9999) has Done status but no history row — must never count.
    const m = computePeriodMetrics(
      NOW,
      { start_date: '2024-01-01', end_date: '2027-12-31', target_amount: 0 },
      DONE_ORDERS,
      FIRST_DONE,
      SF_USED,
      HISTORICAL
    );
    expect(m.actual).toBe(136234); // all counted orders + all historical
  });
});

describe('buildFirstDoneMap', () => {
  it('keeps the EARLIEST Done timestamp when an order was marked Done twice', () => {
    const map = buildFirstDoneMap([
      { order_id: 'o1', created_at: '2026-01-01T10:00:00Z' },
      { order_id: 'o1', created_at: '2026-03-01T10:00:00Z' }, // re-done later — ignored
      { order_id: 'o2', created_at: '2026-02-01T10:00:00Z' },
    ]);
    expect(map.get('o1')).toEqual(new Date('2026-01-01T10:00:00Z'));
    expect(map.get('o2')).toEqual(new Date('2026-02-01T10:00:00Z'));
    expect(map.size).toBe(2);
  });
});

describe('buildSfUsedByOrder', () => {
  it('sums SF line items per order', () => {
    const map = buildSfUsedByOrder(SF_ITEMS);
    expect(map.get('o2')).toBe(1200); // 900 + 300
    expect(map.get('o3')).toBe(500);
    expect(map.has('o1')).toBe(false);
  });
});

describe('computeSfBehaviorDistribution', () => {
  const ENROLLED_PERIODS = [
    { company_id: 'c1', start_date: '2025-07-01', end_date: '2026-06-30' },
  ];
  const ORDERS = [
    { id: 'oA', company_id: 'c1', credit_earned: 800 },  // fully redeemed
    { id: 'oB', company_id: 'c1', credit_earned: 1400 }, // under (leftover 200)
    { id: 'oC', company_id: 'c1', credit_earned: 100 },  // topped up 200
    { id: 'oD', company_id: 'c1', credit_earned: 500 },  // done OUTSIDE period → skipped
    { id: 'oE', company_id: 'c2', credit_earned: 500 },  // company not enrolled → skipped
    { id: 'oF', company_id: 'c1', credit_earned: 0 },    // no earned, no claimed → skipped
  ];
  const DONE_AT = new Map<string, Date>([
    ['oA', new Date('2025-09-01T10:00:00Z')],
    ['oB', new Date('2025-10-01T10:00:00Z')],
    ['oC', new Date('2026-01-01T10:00:00Z')],
    ['oD', new Date('2026-07-10T10:00:00Z')],
    ['oE', new Date('2025-09-01T10:00:00Z')],
    ['oF', new Date('2025-09-01T10:00:00Z')],
  ]);
  const SF_USED = buildSfUsedByOrder([
    { order_id: 'oA', total_price: 500 },
    { order_id: 'oA', total_price: 300 },
    { order_id: 'oB', total_price: 1200 },
    { order_id: 'oC', total_price: 300 },
  ]);

  it('classifies orders by redemption behavior inside enrolled periods only', () => {
    const d = computeSfBehaviorDistribution(ENROLLED_PERIODS, ORDERS, DONE_AT, SF_USED);
    expect(d.sampleSize).toBe(3);
    expect(d.underRedeemedPct).toBeCloseTo(33.33, 1);
    expect(d.fullyRedeemedPct).toBeCloseTo(33.33, 1);
    expect(d.toppedUpPct).toBeCloseTo(33.33, 1);
    expect(d.avgLeftover).toBe(200);
    expect(d.avgTopUp).toBe(200);
  });

  it('returns all zeros for an empty sample', () => {
    const d = computeSfBehaviorDistribution([], [], new Map(), new Map());
    expect(d.sampleSize).toBe(0);
    expect(d.underRedeemedPct).toBe(0);
    expect(d.avgTopUp).toBe(0);
  });
});

describe('historical support funds + imported line items', () => {
  const HIST_WITH_SF = [
    { amount: 5000, sale_date: '2025-08-15', support_fund: 250 }, // Year 1
    { amount: 1234, sale_date: '2024-01-01', support_fund: 60 },  // pre-period
  ];
  const HIST_ITEMS = [
    // Matched to catalog product 1 → merges with the order-derived row.
    { sale_date: '2026-07-12', product_id: 1, sku: 'FPS0018', item_name: 'Shampoo', quantity: 7, amount: 3000, product: { sku: 'FPS0018', item_name: 'Shampoo' } },
    // Unmatched legacy kit → its own row, keyed by SKU.
    { sale_date: '2026-07-12', product_id: null, sku: 'KIT0034', item_name: 'Old Kit', quantity: 2, amount: 900, product: null },
    // Outside the window → ignored.
    { sale_date: '2025-08-15', product_id: 1, sku: 'FPS0018', item_name: 'Shampoo', quantity: 50, amount: 20000, product: { sku: 'FPS0018', item_name: 'Shampoo' } },
  ];

  const result = computeCompanyMetrics({
    now: NOW,
    // 10% SF level: historical accrual is ESTIMATED at SF% × amount.
    company: { ...COMPANY, support_fund: { percent: 10 } },
    periods: PERIODS,
    doneOrders: DONE_ORDERS,
    firstDone: FIRST_DONE,
    historical: HIST_WITH_SF,
    sfItems: SF_ITEMS,
    productItems: PRODUCT_ITEMS,
    historicalItems: HIST_ITEMS,
    windowFrom: new Date('2026-07-01T00:00:00Z'),
    windowTo: new Date('2026-07-31T23:59:59Z'),
  });

  it('historical support_fund counts as SF USED; earned is SF% × amount', () => {
    // Earned: orders 800+1400+400, historical 10% × (5000 + 1234).
    expect(result.toDate.sfEarned).toBeCloseTo(2600 + 623.4, 5);
    // Used: orders 1200+500, historical discounts 250 + 60.
    expect(result.toDate.sfUsed).toBeCloseTo(1700 + 310, 5);
    const year1 = result.periods.find((p) => p.periodName === 'Year 1')!;
    expect(year1.sfEarned).toBeCloseTo(800 + 1400 + 500, 5); // + 10% × 5000
    expect(year1.sfUsed).toBeCloseTo(1200 + 250, 5);
  });

  it('historical sales populate the SF behavior distribution', () => {
    const dist = computeSfBehaviorDistribution(
      [{ company_id: 'c1', start_date: '2025-07-01', end_date: '2026-06-30' }],
      [],
      new Map(),
      new Map(),
      [
        // earned 10% × 5000 = 500, claimed 250 → under-redeemed
        { company_id: 'c1', sale_date: '2025-08-15', amount: 5000, support_fund: 250 },
        // earned 100, claimed 400 → topped up
        { company_id: 'c1', sale_date: '2025-09-01', amount: 1000, support_fund: 400 },
        // outside enrolled periods → ignored
        { company_id: 'c1', sale_date: '2024-01-01', amount: 9999, support_fund: 10 },
      ],
      new Map([['c1', 10]])
    );
    expect(dist.sampleSize).toBe(2);
    expect(dist.underRedeemedPct).toBe(50);
    expect(dist.toppedUpPct).toBe(50);
    expect(dist.avgLeftover).toBeCloseTo(250, 5);
    expect(dist.avgTopUp).toBeCloseTo(300, 5);
  });

  it('merges matched historical items into the same product row and keeps unmatched separate', () => {
    const shampoo = result.window.topProducts.find((p) => p.sku === 'FPS0018')!;
    expect(shampoo.units).toBe(10 + 7); // order units + in-window historical units
    expect(shampoo.revenue).toBe(12000 + 3000);
    const kit = result.window.topProducts.find((p) => p.sku === 'KIT0034')!;
    expect(kit.units).toBe(2);
    expect(kit.revenue).toBe(900);
    expect(result.window.topProducts.find((p) => p.units === 50)).toBeUndefined();
  });
});
