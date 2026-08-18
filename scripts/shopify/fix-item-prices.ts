// Sandbox: give the pass-through items a base price (0) so they're orderable.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  console.log('price levels:', JSON.stringify(await ns.suiteQL(`SELECT id, name FROM pricelevel`)).slice(0, 400));
  for (const id of ['1432', '1433']) {
    try {
      await ns.updateRecord('otherChargeSaleItem', id, {
        price: {
          items: [
            { currencyPage: { id: '1' }, priceLevel: { id: '1' }, quantity: { value: 0 }, price: 0 },
          ],
        },
      });
      console.log(`item ${id}: base price set`);
    } catch (e: any) {
      console.log(`item ${id} FAILED:`, String(e?.message).slice(0, 300));
    }
  }
  console.log('price rows now:', JSON.stringify(await ns.suiteQL(
    `SELECT item, COUNT(*) AS n FROM pricing WHERE item IN (1432, 1433) GROUP BY item`)));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
