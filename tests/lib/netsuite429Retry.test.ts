import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { NetSuiteAPI } from '@/lib/netsuite';

vi.mock('axios');

const CONFIG = {
  accountId: 'TEST',
  consumerKey: 'k',
  consumerSecret: 's',
  tokenId: 't',
  tokenSecret: 'ts',
};

const RATE_LIMITED = {
  status: 429,
  headers: {},
  data: {
    'o:errorDetails': [
      { detail: 'Concurrent request limit exceeded. Request blocked.', 'o:errorCode': 'CONCURRENCY_LIMIT_EXCEEDED' },
    ],
  },
};

afterEach(() => vi.clearAllMocks());

function api(): NetSuiteAPI {
  const ns = new NetSuiteAPI(CONFIG);
  ns.retry429DelaysMs = [1, 1]; // no real waiting in tests
  return ns;
}

describe('NetSuite 429 retry', () => {
  it('suiteQL retries a 429 and succeeds on the second attempt', async () => {
    (axios as any)
      .mockResolvedValueOnce(RATE_LIMITED)
      .mockResolvedValueOnce({ status: 200, headers: {}, data: { items: [{ id: '1' }] } });
    const rows = await api().suiteQL('SELECT 1 FROM dual');
    expect(rows).toEqual([{ id: '1' }]);
    expect(axios).toHaveBeenCalledTimes(2);
  });

  it('createRecord retries a 429 (request was blocked, never executed)', async () => {
    (axios as any)
      .mockResolvedValueOnce(RATE_LIMITED) // create attempt 1 → 429
      .mockResolvedValueOnce({ status: 404, headers: {}, data: {} }) // raced-externalid recheck
      .mockResolvedValueOnce({ status: 204, headers: { location: '/record/v1/salesOrder/777' }, data: {} });
    const id = await api().createRecord('salesOrder', { externalId: 'X-1' });
    expect(id).toBe('777');
  });

  it('gives up after the configured attempts and surfaces the 429', async () => {
    (axios as any).mockResolvedValue(RATE_LIMITED);
    await expect(api().suiteQL('SELECT 1 FROM dual')).rejects.toThrow(/429/);
    expect(axios).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does NOT retry non-429 errors', async () => {
    (axios as any).mockResolvedValue({ status: 400, headers: {}, data: { 'o:message': 'Invalid field' } });
    await expect(api().suiteQL('SELECT nope')).rejects.toThrow(/Invalid field/);
    expect(axios).toHaveBeenCalledTimes(1);
  });
});
