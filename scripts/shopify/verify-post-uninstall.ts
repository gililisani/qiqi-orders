// SANDBOX post-uninstall battery: what did the bundle uninstall destroy,
// and did anything of OURS survive damage?
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const probe = async (label: string, q: string) => {
    try {
      const r = await ns.suiteQL(q);
      console.log(`ALIVE  ${label}: ${JSON.stringify(r).slice(0, 120)}`);
    } catch (e: any) {
      const msg = String(e?.message);
      const gone = msg.includes('Unknown identifier') || msg.includes('Invalid search');
      console.log(`${gone ? 'DEAD ' : 'ERROR'}  ${label}: ${msg.slice(msg.indexOf('Unknown identifier'), msg.indexOf('Unknown identifier') + 60) || msg.slice(0, 100)}`);
    }
  };
  console.log('--- their fields ---');
  await probe('custentity_shop_cust_id', `SELECT COUNT(custentity_shop_cust_id) AS n FROM customer`);
  await probe('custbody_shopify_order_id', `SELECT COUNT(custbody_shopify_order_id) AS n FROM transaction`);
  await probe('custbody_shopify_refund_id', `SELECT COUNT(custbody_shopify_refund_id) AS n FROM transaction`);
  await probe('custitem_shopify_product_id', `SELECT COUNT(custitem_shopify_product_id) AS n FROM item`);
  console.log('--- their scripts ---');
  await probe('bundle scripts remaining', `SELECT COUNT(*) AS n FROM script WHERE LOWER(name) LIKE '%netscore%' OR LOWER(scriptid) LIKE '%shopify%'`);
  console.log('--- our records ---');
  await probe('our SOs (SHOPORD-)', `SELECT COUNT(*) AS n FROM transaction WHERE externalid LIKE 'SHOPORD-%'`);
  await probe('our invoices', `SELECT COUNT(*) AS n FROM transaction WHERE externalid LIKE 'SHOPINV-%'`);
  await probe('our payments', `SELECT COUNT(*) AS n FROM transaction WHERE externalid LIKE 'SHOPPAY-%'`);
  await probe('our IFs', `SELECT COUNT(*) AS n FROM transaction WHERE externalid LIKE 'SHOPFUL-%'`);
  await probe('our CMs+refunds', `SELECT COUNT(*) AS n FROM transaction WHERE externalid LIKE 'SHOPCM-%' OR externalid LIKE 'SHOPRFD-%'`);
  await probe('our items 1432/1433/1534 + discount 1056', `SELECT COUNT(*) AS n FROM item WHERE id IN (1432, 1433, 1534, 1056)`);
  await probe('our customers (SHOP-)', `SELECT COUNT(*) AS n FROM customer WHERE externalid LIKE 'SHOP-%'`);
  await probe('Shopify sales rep', `SELECT COUNT(*) AS n FROM employee WHERE externalid = 'SHOP-SALESREP'`);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
