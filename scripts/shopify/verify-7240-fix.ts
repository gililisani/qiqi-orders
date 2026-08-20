import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const inv = await ns.suiteQL(
    `SELECT id, terms, foreignamountunpaid, foreignamountpaid, status FROM transaction WHERE id = 425316`,
  );
  console.log('invoice:', JSON.stringify(inv));
  // Any other synced invoices still carrying discount-bearing terms?
  const affected = await ns.suiteQL(
    `SELECT t.id, t.tranid, t.terms FROM transaction t
       JOIN term ON term.id = t.terms
      WHERE t.type = 'CustInvc' AND term.discountpercent IS NOT NULL
        AND t.custbody_shopify_order_id IS NOT NULL AND t.id > 423000`,
  );
  console.log('other affected sandbox invoices:', JSON.stringify(affected));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
