// One-time: stamp otherRefNum on the two existing sandbox CMs + clean up
// the TEST-CMLINK experiment records.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  await ns.updateRecord('creditMemo', '424029', { otherRefNum: '#7083' });
  await ns.updateRecord('creditMemo', '424133', { otherRefNum: '#7084' });
  console.log('CM refs stamped');
  await ns.deleteInvoice('424212').catch((e) => console.log('inv cleanup:', String(e?.message).slice(0, 80)));
  await ns.deleteSalesOrder('424083').catch((e) => console.log('so cleanup:', String(e?.message).slice(0, 80)));
  console.log('test records cleaned');
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
