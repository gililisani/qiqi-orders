import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const pair = await ns.suiteQL(`SELECT transaction, location FROM transactionline WHERE transaction IN (25736, 25737) AND location IS NOT NULL AND ROWNUM <= 4`);
  console.log('lines w/ location:', JSON.stringify(pair));
  const loc = (pair as any[]).find((r) => r.location)?.location;
  console.log('using location:', loc);
  for (const itemId of ['1435', '1433']) {
    try {
      const soId = await ns.createRecord('salesOrder', {
        externalId: `TEST-LOC-${itemId}`,
        entity: { id: '7179' },
        subsidiary: { id: '3' },
        location: { id: String(loc) },
        tranDate: '2026-08-18',
        item: { items: [{ item: { id: itemId }, quantity: 1, amount: 3.5 }] },
      });
      console.log(`SO WORKS with item ${itemId} + location: ${soId} — deleting`);
      await ns.deleteSalesOrder(soId);
    } catch (e: any) {
      console.log(`SO with ${itemId}+location FAILED:`, String(e?.message).slice(0, 200));
    }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
