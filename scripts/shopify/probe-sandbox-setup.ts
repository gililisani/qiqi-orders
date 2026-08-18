// Read-only sandbox probe: item→account wiring, payment terms, sales reps.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const tryQ = async (label: string, q: string) => {
    try {
      console.log(label, JSON.stringify(await ns.suiteQL(q)).slice(0, 900));
    } catch (e: any) {
      console.log(label, 'FAILED:', String(e?.message).slice(0, 150));
    }
  };
  await tryQ('items 1432/1433:', `SELECT id, itemid, incomeaccount FROM item WHERE id IN (1432, 1433)`);
  await tryQ('accounts 1571/1573:', `SELECT id, acctnumber, accountsearchdisplayname FROM account WHERE id IN (1571, 1573)`);
  await tryQ('terms:', `SELECT id, name FROM term`);
  await tryQ('shopify-ish employees:', `SELECT id, entityid, issalesrep FROM employee WHERE LOWER(entityid) LIKE '%shopify%'`);
  await tryQ('item 1432/1433 detail:', `SELECT id, itemid, itemtype, subtype, isinactive, subsidiary FROM item WHERE id IN (1432, 1433)`);
  await tryQ('netscore tax item detail:', `SELECT id, itemid, itemtype, subtype, subsidiary FROM item WHERE LOWER(itemid) LIKE '%shopify tax%'`);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
