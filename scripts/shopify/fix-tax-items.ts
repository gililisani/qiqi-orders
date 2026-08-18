// Sandbox: make the two pass-through items usable by Qiqi INC (sub 3).
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const subs = await ns.suiteQL(`SELECT id, name, iselimination FROM subsidiary`);
  console.log('subsidiaries:', JSON.stringify(subs));
  for (const id of ['1432', '1433']) {
    try {
      await ns.updateRecord('otherChargeSaleItem', id, { includeChildren: true });
      console.log(`item ${id}: includeChildren=true OK`);
    } catch (e: any) {
      console.log(`item ${id} PATCH failed:`, String(e?.message).slice(0, 200));
    }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
