// Sandbox: point the existing "Shopify Discount" item (1056) at 420000.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  await ns.updateRecord('discountItem', '1056', { account: { id: '466' } });
  console.log('Shopify Discount (1056) now posts to 420000 (466)');
  console.log(JSON.stringify(await ns.suiteQL(`SELECT id, itemid, incomeaccount FROM item WHERE id = 1056`)));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
