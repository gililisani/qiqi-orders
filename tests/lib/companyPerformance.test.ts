import { describe, it, expect } from 'vitest';
import { computeCompanyMetrics } from '@/lib/companyPerformance';

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
