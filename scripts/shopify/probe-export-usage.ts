// Read-only: is NetScore's NS→Shopify EXPORT direction (items, prices,
// inventory) actually in use? Evidence: item-level mapping fields.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteAPI } from '../../lib/netsuite';

async function main() {
  const ns = createNetSuiteAPI();
  const tryQ = async (label: string, q: string) => {
    try { console.log(label, JSON.stringify(await ns.suiteQL(q))); }
    catch (e: any) { console.log(label, 'FAILED:', String(e?.message).slice(0, 140)); }
  };
  await tryQ('items with shopify product id:',
    `SELECT COUNT(*) AS n FROM item WHERE custitem_shopify_product_id IS NOT NULL`);
  await tryQ('items flagged export-to-shopify:',
    `SELECT COUNT(*) AS n FROM item WHERE custitem_item_export_to_shopify = 'T'`);
  await tryQ('items flagged product-unavailable:',
    `SELECT COUNT(*) AS n FROM item WHERE custitem_product_unavailable = 'T'`);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
