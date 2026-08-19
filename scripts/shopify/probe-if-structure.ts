// Read-only: how do existing Item Fulfillments look — location, lots, links?
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const tryQ = async (label: string, q: string) => {
    try { console.log(label, JSON.stringify(await ns.suiteQL(q)).slice(0, 700)); }
    catch (e: any) { console.log(label, 'FAILED:', String(e?.message).slice(0, 150)); }
  };
  const ifs = await ns.suiteQL<{ id: string; tranid: string }>(
    `SELECT id, tranid FROM transaction WHERE type = 'ItemShip' AND custbody_shopify_order_id IS NOT NULL ORDER BY id DESC FETCH FIRST 2 ROWS ONLY`,
  );
  console.log('sample Shopify IFs:', JSON.stringify(ifs));
  if (!ifs.length) return;
  const ifId = ifs[0].id;
  await tryQ('IF lines:', `SELECT id, item, quantity, location, itemtype FROM transactionline WHERE transaction = ${ifId}`);
  await tryQ('IF status/createdfrom:', `SELECT id, status, createdfrom FROM transaction WHERE id = ${ifId}`);
  await tryQ('lot assignments:', `SELECT inventorynumber, quantity, transactionline FROM inventoryassignment WHERE transaction = ${ifId}`);
  await tryQ('lot detail sample:', `SELECT id, inventorynumber, item, expirationdate FROM inventorynumber WHERE ROWNUM <= 3`);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
