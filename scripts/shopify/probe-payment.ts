// Read-only: does NetScore create Customer Payments? Check invoice INVUS17082 (id 591330).
import dotenv from 'dotenv';
import path from 'path';
import { createNetSuiteAPI } from '../../lib/netsuite';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const ns = createNetSuiteAPI();
  const payments = await ns.getInvoicePaymentsDetailed('591330');
  console.log('payments applied to INVUS17082:', JSON.stringify(payments));
  const inv = await ns.getInvoiceDetails('591330');
  console.log('invoice status:', JSON.stringify(inv));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
