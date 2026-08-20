import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const so = await ns.suiteQL<{ entity: string }>(`SELECT entity FROM transaction WHERE id = 424072`);
  const custId = so[0].entity;
  const cust = await ns.suiteQL(`SELECT id, entityid, terms FROM customer WHERE id = ${custId}`);
  console.log('customer:', JSON.stringify(cust));
  const inv = await ns.suiteQL(`SELECT id, terms, foreignamountunpaid, status FROM transaction WHERE id = 424073`);
  console.log('invoice:', JSON.stringify(inv));
  const terms = await ns.suiteQL(`SELECT id, name, discountpercent, daysuntilexpiry FROM term WHERE id IN (8, 21, 4)`);
  console.log('terms detail:', JSON.stringify(terms));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
