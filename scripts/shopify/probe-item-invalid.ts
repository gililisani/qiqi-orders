// Why is item 1433 invalid on a sub-3 SO? Compare with NetScore's working item.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const tryQ = async (label: string, q: string) => {
    try { console.log(label, JSON.stringify(await ns.suiteQL(q)).slice(0, 600)); }
    catch (e: any) { console.log(label, 'FAILED:', String(e?.message).slice(0, 150)); }
  };
  await tryQ('accounts sub restriction:', `SELECT id, acctnumber, subsidiary FROM account WHERE id IN (1571, 1573)`);
  await tryQ('working NetScore item account:', `SELECT id, itemid, incomeaccount FROM item WHERE id = 1057`);
  await tryQ('netscore item acct sub:', `SELECT id, acctnumber, subsidiary FROM account WHERE id IN (SELECT incomeaccount FROM item WHERE id = 1057)`);
  await tryQ('items again:', `SELECT id, itemid, subsidiary, includechildren FROM item WHERE id IN (1432, 1433, 1057)`);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
