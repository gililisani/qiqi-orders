// Service item + base price row — the combination NetScore's setup implies.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  await ns.updateRecord('serviceSaleItem', '1435', {
    price: { items: [{ currencyPage: { id: '1' }, priceLevel: { id: '1' }, quantity: { value: 0 }, price: 0 }] },
  });
  console.log('base price set on service item 1435');
  try {
    const soId = await ns.createRecord('salesOrder', {
      externalId: 'TEST-SVC-PRICED-SO',
      entity: { id: '7179' },
      subsidiary: { id: '3' },
      tranDate: '2026-08-18',
      item: { items: [{ item: { id: '1435' }, quantity: 1, amount: 3.5, description: 'test tax line' }] },
    });
    console.log('SO WORKS:', soId, '— deleting');
    await ns.deleteSalesOrder(soId);
  } catch (e: any) {
    console.log('SO FAILED:', String(e?.message).slice(0, 250));
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
