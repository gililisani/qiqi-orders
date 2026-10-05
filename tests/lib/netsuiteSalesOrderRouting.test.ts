import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { NetSuiteAPI } from '@/lib/netsuite';

vi.mock('axios');

// The Sales Order shape per routing decision — the format verified against
// live SOs (2026-06-15 / 2026-10-05): cross-subsidiary = every line carries
// `inventorylocation`, no header location; same-subsidiary = header location.

const CONFIG = { accountId: 'TEST', consumerKey: 'k', consumerSecret: 's', tokenId: 't', tokenSecret: 'ts' };

afterEach(() => vi.clearAllMocks());

function order(crossSubsidiary?: boolean) {
  return {
    id: 'order-1',
    po_number: 'PO1',
    created_at: '2026-10-05T10:00:00Z',
    company: {
      company_name: 'Tenant Customer',
      netsuite_number: 'C1',
      netsuite_internal_id: '100',
      subsidiary: { name: 'US Inc', netsuite_id: '3' },
      location: { location_name: '3PL Parent', netsuite_id: '46', subsidiary: { netsuite_id: '1' } },
      class: null,
    },
    order_items: [
      { quantity: 24, unit_price: 50, total_price: 1200, is_support_fund_item: false, product: { sku: 'A1', item_name: 'A', netsuite_name: null } },
      { quantity: 2, unit_price: 50, total_price: 100, is_support_fund_item: true, product: { sku: 'A1', item_name: 'A', netsuite_name: null } },
    ],
    support_fund_used: 10,
    ...(crossSubsidiary === undefined ? {} : { fulfillment: { crossSubsidiary } }),
  };
}

async function capturePayload(o: any) {
  const ns = new NetSuiteAPI(CONFIG) as any;
  ns.findSalesOrderByExternalId = vi.fn().mockResolvedValue(null);
  ns.resolveItemIdsBySku = vi.fn().mockResolvedValue(new Map([['A1', '777']]));
  ns.suiteQL = vi.fn().mockResolvedValue([{ id: '900', itemid: 'Partners Support Funds' }]);
  ns.request = vi.fn().mockResolvedValue({ tranId: 'SO123' });
  vi.mocked(axios).mockResolvedValue({ status: 204, headers: { location: '/salesOrder/555' }, data: '' } as any);
  const result = await ns.pushOrderToNetSuite(o);
  const call = vi.mocked(axios).mock.calls.at(-1)![0] as any;
  return { result, payload: JSON.parse(call.data) };
}

describe('pushOrderToNetSuite — fulfillment routing', () => {
  it('cross-subsidiary: inventorylocation on every line (incl. discount), no header location', async () => {
    const { result, payload } = await capturePayload(order(true));
    expect(result).toEqual({ nsSOId: '555', soNumber: 'SO123' });
    expect(payload.location).toBeUndefined();
    expect(payload.subsidiary).toEqual({ id: '3' });
    expect(payload.item.items).toHaveLength(2); // A1 consolidated + support-fund discount
    for (const line of payload.item.items) expect(line.inventorylocation).toEqual({ id: '46' });
    expect(payload.item.items[0]).toMatchObject({ item: { id: '777' }, quantity: 26, rate: 50 });
  });

  it('same-subsidiary: header location, no inventorylocation on lines', async () => {
    const { payload } = await capturePayload(order(false));
    expect(payload.location).toEqual({ id: '46' });
    for (const line of payload.item.items) expect(line.inventorylocation).toBeUndefined();
  });

  it('the routing decision is authoritative over the warehouse-subsidiary fallback', async () => {
    // Warehouse subsidiary (1) ≠ customer subsidiary (3) would derive "cross",
    // but the resolver said same-subsidiary → header location.
    const { payload } = await capturePayload(order(false));
    expect(payload.location).toEqual({ id: '46' });
    // Without a routing decision the old derivation still applies.
    const legacy = await capturePayload(order(undefined));
    expect(legacy.payload.location).toBeUndefined();
    expect(legacy.payload.item.items[0].inventorylocation).toEqual({ id: '46' });
  });
});
