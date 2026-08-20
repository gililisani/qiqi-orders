import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteAPI } from '../../lib/netsuite';

async function main() {
  const ns = createNetSuiteAPI();
  console.log('count all/stamped:', JSON.stringify(await ns.suiteQL(
    `SELECT COUNT(*) AS total, COUNT(custentity_shop_cust_id) AS stamped FROM customer`)));
  console.log('count where not null:', JSON.stringify(await ns.suiteQL(
    `SELECT COUNT(*) AS n FROM customer WHERE custentity_shop_cust_id IS NOT NULL`)));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
