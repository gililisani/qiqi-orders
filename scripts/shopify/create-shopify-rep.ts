// One-time (sandbox): create the "Shopify" sales-rep employee the owner approved.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const existing = await ns.suiteQL<{ id: string }>(
    `SELECT id FROM employee WHERE LOWER(entityid) = 'shopify'`,
  );
  if (existing.length) {
    console.log('already exists:', existing[0].id);
    return;
  }
  const id = await ns.createRecord('employee', {
    externalId: 'SHOP-SALESREP',
    entityId: 'Shopify',
    firstName: 'Shopify',
    lastName: 'Channel',
    isSalesRep: true,
    subsidiary: { id: '3' },
  });
  console.log('created Shopify sales rep, id:', id);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
