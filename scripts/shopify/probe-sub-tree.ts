import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  console.log('tree:', JSON.stringify(await ns.suiteQL(`SELECT id, name, parent FROM subsidiary`)));
  console.log('items:', JSON.stringify(await ns.suiteQL(
    `SELECT id, itemid, subsidiary, includechildren FROM item WHERE id IN (1040, 1432, 1433, 1057)`)));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
