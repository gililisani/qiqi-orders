import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  console.log('loc 31:', JSON.stringify(await ns.suiteQL(`SELECT id, name FROM location WHERE id = 31`)));
  console.log('lot records:', JSON.stringify(await ns.suiteQL(
    `SELECT id, item, inventorynumber, expirationdate FROM inventorynumber WHERE id IN (293, 311, 372, 429)`)).slice(0, 600));
  console.log('joined FEFO view for item 991 @31:', JSON.stringify(await ns.suiteQL(
    `SELECT inv.id, inv.inventorynumber, inv.expirationdate, bal.quantityavailable
       FROM inventorynumber inv
       JOIN inventorynumberlocation bal ON bal.inventorynumber = inv.id
      WHERE inv.item = 991 AND bal.location = 31 AND bal.quantityavailable > 0
      ORDER BY inv.expirationdate ASC`)).slice(0, 600));
  console.log('lot balances @31:', JSON.stringify(await ns.suiteQL(
    `SELECT inventorynumber, location, quantityavailable FROM inventorynumberlocation WHERE location = 31 AND quantityavailable > 0 AND ROWNUM <= 6`)).slice(0, 500));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
