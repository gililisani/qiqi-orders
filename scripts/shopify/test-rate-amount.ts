// If a line has BOTH rate and amount and they disagree (uneven division),
// which wins? Determines whether we can always send rate.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const soId = await ns.createRecord('salesOrder', {
    externalId: 'TEST-RATE-AMOUNT',
    entity: { id: '7179' },
    subsidiary: { id: '3' },
    tranDate: '2026-08-19',
    item: {
      items: [
        { item: { id: '1040' }, quantity: 3, price: { id: '-1' }, rate: 33.33, amount: 100.0, description: 'uneven' },
      ],
    },
  });
  const lines = await ns.suiteQL(
    `SELECT quantity, rate, netamount FROM transactionline WHERE transaction = ${soId} AND mainline = 'F' AND taxline = 'F'`,
  );
  console.log('line:', JSON.stringify(lines));
  await ns.deleteSalesOrder(soId);
  console.log('cleaned up');
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
