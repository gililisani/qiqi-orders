// Read-only: which shipping methods exist, and which one do NetScore-era SOs use?
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteAPI } from '../../lib/netsuite';

async function main() {
  const ns = createNetSuiteAPI();
  const tryQ = async (label: string, q: string) => {
    try {
      console.log(label, JSON.stringify(await ns.suiteQL(q)).slice(0, 700));
    } catch (e: any) {
      console.log(label, 'FAILED:', String(e?.message).slice(0, 150));
    }
  };
  await tryQ('ship items:', `SELECT id, itemid, description FROM shipitem WHERE isinactive = 'F'`);
  await tryQ('NetScore SO ship:', `SELECT shipcarrier, shipmethod FROM transaction WHERE id = 591329`);
  await tryQ('method 1171:', `SELECT id, itemid, itemtype FROM item WHERE id = 1171`);
  await tryQ('all ship items:', `SELECT id, itemid FROM item WHERE itemtype = 'ShipItem'`);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
