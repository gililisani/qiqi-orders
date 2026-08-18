// Deactivate the throwaway items created during REST-behavior debugging.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  for (const [type, id] of [['otherChargeSaleItem', '1434'], ['serviceSaleItem', '1435']] as const) {
    await ns.updateRecord(type, id, { isInactive: true });
    console.log(`${type} ${id} deactivated`);
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
