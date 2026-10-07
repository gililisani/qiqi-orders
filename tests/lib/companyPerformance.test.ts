import { describe, it, expect } from 'vitest';
import {
  buildFirstDoneMap,
  buildSfUsedByOrder,
  computeCompanyMetrics,
  computePeriodMetrics,
  computeSfBehaviorDistribution,
  type LedgerProductLine,
  type LedgerSale,
  type SfEvent,
} from '@/lib/companyPerformance';

const NOW = new Date('2026-07-15T12:00:00Z');

// 2% support funds, agreement since 2025-07-01.
const COMPANY = {
  id: 'c1',
  company_name: 'Evolve',
  netsuite_number: 'C1001',
  support_fund_id: 'sf1',
  support_fund: { percent: 2 },
  contract_execution_date: '2025-07-01',
  subsidiary: { name: 'Qiqi INC.' },
};

const PERIODS = [
  { id: 'p1', period_name: 'Year 1', start_date: '2025-07-01', end_date: '2026-06-30', target_amount: 100000 },
  { id: 'p2', period_name: 'Year 2', start_date: '2026-07-01', end_date: '2027-06-30', target_amount: 130000 },
];

const sale = (o: Partial<LedgerSale> & Pick<LedgerSale, 'doc_date' | 'sales_amount'>): LedgerSale => ({
  company_id: 'c1',
  doc_type: 'invoice',
  ...o,
});

// The ledger: what NetSuite billed.
const SALES: LedgerSale[] = [
  sale({ doc_date: '2025-09-10', sales_amount: 40000 }),
  sale({ doc_date: '2026-03-05', sales_amount: 70000 }),
  sale({ doc_date: '2026-07-10', sales_amount: 20000 }),
  sale({ doc_date: '2026-07-20', doc_type: 'credit_memo', sales_amount: -1000 }), // a return
  sale({ doc_date: '2024-01-01', sales_amount: 1234 }), // before the agreement
  sale({ doc_date: '2025-08-15', sales_amount: 5000 }),
];

const ev = (o: Partial<SfEvent> & Pick<SfEvent, 'day'>): SfEvent => ({
  company_id: 'c1',
  source: 'order',
  earned: 0,
  used: 0,
  ...o,
});

// Support funds (support_fund_events): Hub orders carry what they earned and
// claimed when placed; NetSuite-only invoices carry what was redeemed (and an
// estimate only before the first Hub order — computed by the view).
const SF_EVENTS: SfEvent[] = [
  ev({ day: '2025-09-12', earned: 800, used: 800 }),
  ev({ day: '2026-03-07', earned: 1400, used: 1200 }),
  ev({ day: '2026-07-12', earned: 400, used: 500 }), // topped up
  ev({ day: '2024-01-01', source: 'erp', earned: 0, used: 50 }), // before the agreement
  ev({ day: '2025-08-15', source: 'erp', earned: 100, used: 0 }), // pre-Hub invoice, estimated
];

const PRODUCT_LINES: LedgerProductLine[] = [
  { doc_date: '2026-07-10', product_id: 1, sku: 'FPS0018', item_name: 'Shampoo', quantity: 10, amount: 12000 },
  { doc_date: '2026-07-10', product_id: 2, sku: 'FPS0030', item_name: 'Masque', quantity: 5, amount: 8000 },
  { doc_date: '2026-07-20', product_id: 1, sku: 'FPS0018', item_name: 'Shampoo', quantity: -1, amount: -1000 }, // returned
  { doc_date: '2025-09-10', product_id: 1, sku: 'FPS0018', item_name: 'Shampoo', quantity: 99, amount: 40000 }, // outside window
  { doc_date: '2026-07-10', product_id: null, sku: 'FPS0007', item_name: 'Vega (discontinued)', quantity: 0, amount: 0 },
];

function build(windowFrom: Date, windowTo: Date) {
  return computeCompanyMetrics({
    now: NOW,
    company: COMPANY,
    periods: PERIODS,
    sales: SALES,
    sfEvents: SF_EVENTS,
    productLines: PRODUCT_LINES,
    windowFrom,
    windowTo,
  });
}

describe('computeCompanyMetrics (sales ledger)', () => {
  const result = build(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-31T23:59:59Z'));

  it('to-date = everything billed since the agreement; earlier sales reported apart', () => {
    expect(result.toDate.sales).toBe(134000); // 40000 + 70000 + 20000 − 1000 + 5000
    expect(result.toDate.salesBeforeAgreement).toBe(1234);
    expect(result.toDate.invoices).toBe(4); // credit memo is not an invoice
  });

  it('support funds to date come from the events since the agreement, not from billing', () => {
    expect(result.toDate.sfEarned).toBe(2700); // 800 + 1400 + 400 + 100
    expect(result.toDate.sfUsed).toBe(2500); // the pre-agreement 50 is left out
    expect(result.toDate.sfBalance).toBe(200);
  });

  it('attributes billed sales to periods by document date', () => {
    const year1 = result.periods.find((p) => p.periodName === 'Year 1')!;
    expect(year1.actual).toBe(115000); // 40000 + 70000 + 5000
    expect(year1.status).toBe('Complete');
    expect(year1.sfEarned).toBe(2300);
    expect(year1.sfUsed).toBe(2000);

    const year2 = result.periods.find((p) => p.periodName === 'Year 2')!;
    expect(year2.actual).toBe(19000); // 20000 − 1000 credit memo
    expect(year2.sfBalance).toBe(-100); // earned 400, claimed 500 → top-up; the return doesn't touch SF
  });

  it('windows sales, invoices, units and the product mix (returns subtract)', () => {
    expect(result.window.sales).toBe(19000);
    expect(result.window.invoices).toBe(1);
    expect(result.window.units).toBe(14);
    expect(result.window.topProducts[0]).toMatchObject({ sku: 'FPS0018', units: 9, revenue: 11000 });
    expect(result.window.productCount).toBe(2); // the zero-value line is not a product bought
    expect(result.window.sfEarned).toBe(400);
    expect(result.window.sfUsed).toBe(500);
  });

  it('reports agreement span from first to last period', () => {
    expect(result.company.agreementStart).toBe('2025-07-01');
    expect(result.company.agreementEnd).toBe('2027-06-30');
  });

  it('a wider window picks up everything billed and every support-fund event in it', () => {
    const wide = build(new Date('2023-01-01T00:00:00Z'), new Date('2026-12-31T23:59:59Z'));
    expect(wide.window.sales).toBe(135234); // includes the pre-agreement 1234
    expect(wide.window.invoices).toBe(5);
    expect(wide.window.sfEarned).toBe(2700);
    expect(wide.window.sfUsed).toBe(2550);
    expect(wide.window.topProducts[0]).toMatchObject({ sku: 'FPS0018', units: 108 });
  });

  it('a company without an agreement date counts everything to date', () => {
    const r = computeCompanyMetrics({
      now: NOW,
      company: { ...COMPANY, contract_execution_date: null },
      periods: [],
      sales: SALES,
      productLines: [],
      windowFrom: NOW,
      windowTo: NOW,
    });
    expect(r.toDate.sales).toBe(135234);
    expect(r.toDate.salesBeforeAgreement).toBe(0);
  });
});

describe('computePeriodMetrics', () => {
  it('active period ahead of schedule → Ahead, with day/pace math', () => {
    // Year 2 started 2026-07-01; NOW is 15 days in.
    const m = computePeriodMetrics(NOW, { start_date: '2026-07-01', end_date: '2027-06-30', target_amount: 130000 }, SALES, SF_EVENTS);
    expect(m.actual).toBe(19000);
    expect(m.daysTotal).toBe(365);
    expect(m.daysElapsed).toBe(15);
    expect(m.daysRemaining).toBe(350);
    expect(m.progressPct).toBeCloseTo(14.615, 2);
    expect(m.expectedPct).toBeCloseTo(4.11, 1);
    expect(m.paceDeltaPct).toBeCloseTo(m.progressPct - m.expectedPct, 6);
    expect(m.status).toBe('Ahead');
    expect(m.sfEarned).toBe(400);
    expect(m.sfUsed).toBe(500);
  });

  it('without events, support funds are zero (target recalculation passes sales only)', () => {
    const m = computePeriodMetrics(NOW, { start_date: '2026-07-01', end_date: '2027-06-30', target_amount: 130000 }, SALES);
    expect(m.actual).toBe(19000);
    expect(m.sfEarned).toBe(0);
    expect(m.sfUsed).toBe(0);
  });

  it('ended period with target met → Complete; days fully elapsed', () => {
    const m = computePeriodMetrics(NOW, { start_date: '2025-07-01', end_date: '2026-06-30', target_amount: 100000 }, SALES);
    expect(m.actual).toBe(115000);
    expect(m.status).toBe('Complete');
    expect(m.daysElapsed).toBe(m.daysTotal);
    expect(m.daysRemaining).toBe(0);
    expect(m.expectedPct).toBe(100);
  });

  it('ended period with target missed → Fail, never Slipping', () => {
    const m = computePeriodMetrics(NOW, { start_date: '2025-07-01', end_date: '2026-06-30', target_amount: 200000 }, SALES);
    expect(m.status).toBe('Fail');
  });

  it('future period → Not Started with zero elapsed', () => {
    const m = computePeriodMetrics(NOW, { start_date: '2027-07-01', end_date: '2028-06-30', target_amount: 50000 }, SALES);
    expect(m.status).toBe('Not Started');
    expect(m.daysElapsed).toBe(0);
    expect(m.expectedPct).toBe(0);
    expect(m.actual).toBe(0);
  });

  it('active period far behind schedule → Slipping', () => {
    const m = computePeriodMetrics(NOW, { start_date: '2026-01-01', end_date: '2026-12-31', target_amount: 1000000 }, SALES);
    expect(m.actual).toBe(89000); // 70000 + 20000 − 1000
    expect(m.status).toBe('Slipping');
  });

  it('period boundaries are inclusive calendar days', () => {
    const m = computePeriodMetrics(NOW, { start_date: '2026-07-10', end_date: '2026-07-20', target_amount: 1 }, SALES);
    expect(m.actual).toBe(19000);
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

describe('computeSfBehaviorDistribution (per purchase)', () => {
  const ENROLLED = [{ company_id: 'c1', start_date: '2025-07-01', end_date: '2026-06-30' }];
  const E: SfEvent[] = [
    ev({ day: '2025-09-01', earned: 800, used: 800 }), // fully redeemed
    ev({ day: '2025-10-01', earned: 1400, used: 1200 }), // leftover 200
    ev({ day: '2026-01-01', source: 'erp', earned: 100, used: 300 }), // topped up 200
    ev({ day: '2026-08-01', earned: 500, used: 0 }), // outside the period → skipped
    ev({ company_id: 'c2', day: '2025-09-01', earned: 500 }), // not enrolled → skipped
    ev({ day: '2025-11-01', source: 'erp' }), // nothing earned or claimed → skipped
  ];

  it('classifies Hub orders and NetSuite-only invoices inside enrolled periods only', () => {
    const d = computeSfBehaviorDistribution(ENROLLED, E);
    expect(d.sampleSize).toBe(3);
    expect(d.fullyRedeemedPct).toBeCloseTo(33.33, 1);
    expect(d.underRedeemedPct).toBeCloseTo(33.33, 1);
    expect(d.toppedUpPct).toBeCloseTo(33.33, 1);
    expect(d.avgLeftover).toBeCloseTo(200, 6);
    expect(d.avgTopUp).toBeCloseTo(200, 6);
  });

  it('returns all zeros for an empty sample', () => {
    const d = computeSfBehaviorDistribution([], []);
    expect(d).toEqual({ underRedeemedPct: 0, fullyRedeemedPct: 0, toppedUpPct: 0, avgTopUp: 0, avgLeftover: 0, sampleSize: 0 });
  });
});
