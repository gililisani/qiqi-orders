// Create an OthCharge item entirely via REST, then try it on an SO.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  let itemId = await ns.findRecordIdByExternalId('otherChargeSaleItem', 'TEST-PASSTHRU');
  if (!itemId) {
    itemId = await ns.createRecord('otherChargeSaleItem', {
      externalId: 'TEST-PASSTHRU',
      itemId: 'TEST Pass-through Charge',
      subsidiary: { items: [{ id: '11' }] },
      includeChildren: true,
      incomeAccount: { id: '1571' },
      taxSchedule: { id: '1' },
    });
    console.log('created test item:', itemId);
  } else {
    console.log('test item exists:', itemId);
  }
  try {
    const soId = await ns.createRecord('salesOrder', {
      externalId: 'TEST-RESTITEM-SO',
      entity: { id: '7179' },
      subsidiary: { id: '3' },
      tranDate: '2026-08-18',
      item: { items: [{ item: { id: itemId }, quantity: 1, amount: 1.0 }] },
    });
    console.log('SO WORKS with REST-created item:', soId, '— deleting');
    await ns.deleteSalesOrder(soId);
  } catch (e: any) {
    console.log('SO FAILED:', String(e?.message).slice(0, 250));
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
