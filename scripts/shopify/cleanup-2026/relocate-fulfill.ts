import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';
import { shopifyGraphQL } from '../../../lib/shopify/client';
import { createNetSuiteForTarget } from '../../../lib/shopify/engine/nsTarget';
import { engineConfigForTarget } from '../../../lib/shopify/engine/config';
import { ensureItemFulfillments } from '../../../lib/shopify/engine/fulfill';
import { buildFulfillmentPlans } from '../../../lib/shopify/core/fulfillmentTransform';
import { ORDER_SELECTION } from '../../../lib/shopify/orderQuery';

const NAMES = process.argv.slice(2);
async function main() {
  const ns: any = createNetSuiteForTarget('production');
  const config = engineConfigForTarget('production');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  for (const name of NAMES) {
    try {
      const d = await shopifyGraphQL(`query ByName($q: String!) { orders(first: 2, query: $q) { nodes { ${ORDER_SELECTION} } } }`, { q: `name:#${name}` });
      const order = d.orders.nodes.find((o: any) => o.name === `#${name}`);
      const sid = order.id.replace(/^.*\//, '');
      const { data: st } = await db.from('netscore_transaction_stamps').select('ns_transaction_id, tran_type').eq('shopify_order_id', sid).eq('ns_target', 'production');
      const soId = st!.find((s) => s.tran_type === 'SalesOrd')!.ns_transaction_id;
      // 1. relocate inventory lines 31 → 46 (BrandFox, CSF)
      const lines = await ns.suiteQL(`SELECT id, inventorylocation FROM transactionline WHERE transaction = ${soId} AND mainline = 'F' AND itemtype IN ('InvtPart','Assembly','Kit')`);
      const toFix = lines.filter((l: any) => String(l.inventorylocation) !== '46');
      if (toFix.length) {
        await ns.updateRecord('salesOrder', soId, { item: { items: toFix.map((l: any) => ({ line: Number(l.id), inventorylocation: { id: '46' } })) } });
      }
      const after = await ns.suiteQL(`SELECT id, inventorylocation, inventorysubsidiary FROM transactionline WHERE transaction = ${soId} AND mainline = 'F' AND itemtype IN ('InvtPart','Assembly','Kit')`);
      const bad = after.filter((l: any) => String(l.inventorylocation) !== '46');
      if (bad.length) { console.log(`✗ #${name}: relocation did not stick on lines ${bad.map((l: any) => l.id).join(',')}`); continue; }
      console.log(`  #${name}: ${toFix.length} lines relocated 31→46 (inventory subsidiary now ${[...new Set(after.map((l: any) => l.inventorysubsidiary))].join('/')})`);
      // 2. fulfill from BrandFox with original ship date + FEFO lots
      const r = await ensureItemFulfillments(buildFulfillmentPlans(order), soId, ns, config);
      const ifs = await ns.suiteQL(`SELECT tranid, trandate FROM transaction WHERE id IN (${r.nsFulfillmentIds.map(Number).join(',')})`);
      console.log(`✓ #${name}: ${ifs.map((i: any) => `${i.tranid} (${i.trandate})`).join(', ')}`);
    } catch (e: any) {
      console.log(`✗ #${name}: ${String(e?.message ?? e).slice(0, 240)}`);
    }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
