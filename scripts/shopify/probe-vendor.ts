import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  console.log('shopify vendors:', JSON.stringify(await ns.suiteQL(
    `SELECT id, entityid, companyname, subsidiary FROM vendor WHERE LOWER(companyname) LIKE '%shopify%' OR LOWER(entityid) LIKE '%shopify%'`)));
  console.log('fee account 622070:', JSON.stringify(await ns.suiteQL(
    `SELECT id, acctnumber, accountsearchdisplayname FROM account WHERE acctnumber IN ('622070', '100101')`)));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
