// Read-only: what category/class do existing Shopify-era customers carry (prod)?
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteAPI } from '../../lib/netsuite';

async function main() {
  const ns = createNetSuiteAPI();
  const tryQ = async (label: string, q: string) => {
    try {
      const rows = await ns.suiteQL<Record<string, unknown>>(q);
      console.log(label, JSON.stringify(rows).slice(0, 800));
    } catch (e: any) {
      console.log(label, 'FAILED:', String(e?.message).slice(0, 120));
    }
  };
  await tryQ('B2C (person) stamped:', `SELECT id, entityid, category, custentity3, isperson FROM customer WHERE custentity_shop_cust_id IS NOT NULL AND isperson = 'T' AND ROWNUM <= 5`);
  await tryQ('B2B (company) stamped:', `SELECT id, entityid, category, custentity3, isperson FROM customer WHERE custentity_shop_cust_id IS NOT NULL AND isperson = 'F' AND ROWNUM <= 5`);
  await tryQ('distinct category values:', `SELECT DISTINCT category FROM customer WHERE custentity_shop_cust_id IS NOT NULL`);
  await tryQ('distinct custentity3 values:', `SELECT DISTINCT custentity3 FROM customer WHERE custentity_shop_cust_id IS NOT NULL`);
  await tryQ('Pure Art Salon:', `SELECT id, category, custentity3, isperson FROM customer WHERE id = 7179`);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
