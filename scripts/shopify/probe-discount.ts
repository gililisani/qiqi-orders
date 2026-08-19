import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  console.log('discount items:', JSON.stringify(await ns.suiteQL(
    `SELECT id, itemid, itemtype, incomeaccount, isinactive FROM item WHERE itemtype = 'Discount' AND LOWER(itemid) LIKE '%shopify%'`)));
  console.log('420000 account:', JSON.stringify(await ns.suiteQL(
    `SELECT id, acctnumber, accountsearchdisplayname FROM account WHERE acctnumber = '420000'`)));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
