import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const usage = await ns.suiteQL(
    `SELECT transaction, item FROM transactionline WHERE item = 1057 AND ROWNUM <= 5`,
  );
  console.log('sandbox SO/invoice lines using NetScore tax item 1057:', JSON.stringify(usage).slice(0, 400));
  if ((usage as any[]).length) {
    const t = (usage as any[])[0].transaction;
    const tx = await ns.suiteQL(`SELECT id, type, tranid FROM transaction WHERE id = ${t}`);
    console.log('first such transaction:', JSON.stringify(tx));
  }

  // Standalone invoice with a tax item line (owner: OthCharge is invoice-legal).
  for (const itemId of ['1433', '1435']) {
    try {
      const invId = await ns.createRecord('invoice', {
        externalId: `TEST-INV-TAXLINE-${itemId}`,
        entity: { id: '7179' },
        subsidiary: { id: '3' },
        tranDate: '2026-08-18',
        item: { items: [{ item: { id: itemId }, quantity: 1, amount: 3.5, description: 'test tax line' }] },
      });
      console.log(`invoice WORKS with item ${itemId}: ${invId} — deleting`);
      await ns.deleteInvoice(invId);
    } catch (e: any) {
      console.log(`invoice with ${itemId} FAILED:`, String(e?.message).slice(0, 200));
    }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
