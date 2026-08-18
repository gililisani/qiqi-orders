// Can the SO→invoice transform carry EXTRA tax lines? Or does the body
// sublist replace the product lines? Controlled experiment + cleanup.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const soId = await ns.createRecord('salesOrder', {
    externalId: 'TEST-TAXAPPEND-SO',
    entity: { id: '7179' },
    subsidiary: { id: '3' },
    tranDate: '2026-08-18',
    item: { items: [{ item: { id: '1040' }, quantity: 1, amount: 10.0, description: 'product' }] },
  });
  console.log('SO created:', soId);
  let invId: string | null = null;
  try {
    invId = await ns.transformRecord('salesOrder', soId, 'invoice', {
      externalId: 'TEST-TAXAPPEND-INV',
      item: { items: [{ item: { id: '1433' }, quantity: 1, amount: 3.5, description: 'NY tax' }] },
    });
    console.log('invoice created:', invId);
    const lines = await ns.suiteQL(
      `SELECT item, quantity, rate, netamount FROM transactionline WHERE transaction = ${invId} AND mainline = 'F' AND taxline = 'F'`,
    );
    console.log('invoice lines:', JSON.stringify(lines));
    const so = await ns.suiteQL(`SELECT id, status FROM transaction WHERE id = ${soId}`);
    console.log('SO status after:', JSON.stringify(so));
  } catch (e: any) {
    console.log('transform FAILED:', String(e?.message).slice(0, 250));
  } finally {
    if (invId) await ns.deleteInvoice(invId).catch((e) => console.log('inv cleanup failed', String(e?.message).slice(0, 80)));
    await ns.deleteSalesOrder(soId).catch((e) => console.log('so cleanup failed', String(e?.message).slice(0, 80)));
    console.log('cleaned up');
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
