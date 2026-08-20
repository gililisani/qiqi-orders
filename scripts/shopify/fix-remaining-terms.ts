import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const rows = await ns.suiteQL<{ custbody_shopify_order_id: string }>(
    `SELECT custbody_shopify_order_id FROM transaction WHERE id IN (423228, 423426)`,
  );
  console.log(rows.map((r) => r.custbody_shopify_order_id).join(' '));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
