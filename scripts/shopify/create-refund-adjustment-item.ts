// Sandbox: "Shopify Refund Adjustment" — carries refund amounts (revenue
// reversal) without inventory movement. Income account = 410000 Sales
// (id 833, same as NetScore's convention); CPA can re-point anytime.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  let id = await ns.findRecordIdByExternalId('otherChargeSaleItem', 'SHOP-REFUND-ADJ');
  if (!id) {
    id = await ns.createRecord('otherChargeSaleItem', {
      externalId: 'SHOP-REFUND-ADJ',
      itemId: 'Shopify Refund Adjustment',
      subsidiary: { items: [{ id: '11' }] },
      includeChildren: true,
      incomeAccount: { id: '833' },
      taxSchedule: { id: '1' },
    });
    await ns.updateRecord('otherChargeSaleItem', id, {
      price: { items: [{ currencyPage: { id: '1' }, priceLevel: { id: '1' }, quantity: { value: 0 }, price: 0 }] },
    });
  }
  console.log('refund adjustment item id:', id);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
