// Read-only: live state of NetScore's scripts + deployments in PROD.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteAPI } from '../../lib/netsuite';

async function main() {
  const ns = createNetSuiteAPI();
  const tryQ = async (label: string, q: string) => {
    try { const r = await ns.suiteQLPaged(q); console.log(label, JSON.stringify(r)); return r; }
    catch (e: any) { console.log(label, 'FAILED:', String(e?.message).slice(0, 160)); return []; }
  };
  await tryQ('scripts:', `SELECT id, name, scriptid, isinactive FROM script WHERE LOWER(scriptid) LIKE '%shopify%' OR LOWER(name) LIKE '%netscore%' OR LOWER(name) LIKE '%shopify%'`);
  await tryQ('deployments:', `SELECT d.id, d.scriptid, d.isdeployed, s.name FROM scriptdeployment d JOIN script s ON s.id = d.script WHERE LOWER(s.scriptid) LIKE '%shopify%' OR LOWER(s.name) LIKE '%netscore%' OR LOWER(s.name) LIKE '%shopify%'`);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
