import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const tryQ = async (label: string, q: string) => {
    try { console.log(label, JSON.stringify(await ns.suiteQL(q)).slice(0, 500)); }
    catch (e: any) { console.log(label, 'FAILED:', String(e?.message).slice(0, 120)); }
  };
  await tryQ('item tax schedules:', `SELECT id, itemid, taxschedule FROM item WHERE id IN (1040, 1432, 1433, 1057)`);
  await tryQ('tax schedules list:', `SELECT id, name FROM taxschedule`);
  await tryQ('price rows:', `SELECT item, COUNT(*) AS n FROM pricing WHERE item IN (1040, 1432, 1433, 1057) GROUP BY item`);
  await tryQ('itemvendor/currency-ish:', `SELECT id, itemid, currency, isonline FROM item WHERE id IN (1040, 1433)`);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
