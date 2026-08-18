/**
 * Resolve the NetSuite client per sync target. Sandbox and production use
 * disjoint env var sets so the two can never be confused: a missing
 * NETSUITE_SB_* var fails loudly rather than falling back to production.
 */
import { NetSuiteAPI } from '../../netsuite';

export type NsTarget = 'sandbox' | 'production';

export function createNetSuiteForTarget(target: NsTarget): NetSuiteAPI {
  const prefix = target === 'sandbox' ? 'NETSUITE_SB' : 'NETSUITE';
  const read = (suffix: string): string => {
    const name = `${prefix}_${suffix}`;
    const v = process.env[name];
    if (!v) throw new Error(`${name} is not set — refusing to guess the ${target} NetSuite target`);
    return v;
  };
  return new NetSuiteAPI({
    accountId: read('ACCOUNT_ID'),
    consumerKey: read('CONSUMER_KEY'),
    consumerSecret: read('CONSUMER_SECRET'),
    tokenId: read('TOKEN_ID'),
    tokenSecret: read('TOKEN_SECRET'),
  });
}
