/**
 * Read-only sandbox preflight: connection, item universe, clearing
 * accounts, subsidiary, NetScore stamps, a known customer.
 *   npx tsx scripts/shopify/sandbox-check.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');

  const items = await ns.suiteQL<{ n: string }>(`SELECT COUNT(*) AS n FROM item WHERE isinactive = 'F'`);
  console.log('active items:', items[0].n);

  const custs = await ns.suiteQL<{ n: string; stamped: string }>(
    `SELECT COUNT(*) AS n, COUNT(custentity_shop_cust_id) AS stamped FROM customer`,
  );
  console.log('customers:', custs[0].n, 'with NetScore stamp:', custs[0].stamped);

  const accounts = await ns.suiteQL<Record<string, unknown>>(
    `SELECT id, acctnumber, accountsearchdisplayname FROM account WHERE id IN (1019, 1021, 1026)`,
  );
  console.log('clearing accounts:', JSON.stringify(accounts));

  const subs = await ns.suiteQL<Record<string, unknown>>(
    `SELECT id, name FROM subsidiary WHERE id = 3`,
  );
  console.log('subsidiary 3:', JSON.stringify(subs));

  const tara = await ns.suiteQL<Record<string, unknown>>(
    `SELECT id, entityid, companyname, custentity_shop_cust_id FROM customer WHERE LOWER(email) = 'tara_renz@yahoo.com'`,
  );
  console.log('known Shopify customer (Pure Art Salon):', JSON.stringify(tara));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
