// Sandbox: "Shopify Discount" — Discount item posting to 420000 (466).
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  let id = await ns.findRecordIdByExternalId('discountItem', 'SHOP-DISCOUNT');
  if (!id) {
    id = await ns.createRecord('discountItem', {
      externalId: 'SHOP-DISCOUNT',
      itemId: 'Shopify Discount',
      subsidiary: { items: [{ id: '11' }] },
      includeChildren: true,
      account: { id: '466' },
      rate: 0, // placeholder — every transaction overrides with its exact amount
    });
  }
  console.log('Shopify Discount item id:', id);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
