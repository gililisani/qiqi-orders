import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { shopifyGraphQL } from '../../lib/shopify/client';
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const d = await shopifyGraphQL(`{
    order: node(id: "gid://shopify/Order/7526732824631") {
      ... on Order {
        netPaymentSet { shopMoney { amount } }
        totalTipReceivedSet { shopMoney { amount } }
        transactions(first: 10) { id kind status gateway amountSet { shopMoney { amount } } }
      }
    }
  }`);
  console.log('shopify:', JSON.stringify(d.order, null, 1));

  const ns = createNetSuiteForTarget('sandbox');
  for (const t of d.order.transactions) {
    const extId = `SHOPPAY-${t.id.replace(/^.*\//, '')}`;
    const payId = await ns.findRecordIdByExternalId('customerpayment', extId);
    if (!payId) { console.log(`${extId}: not in NS`); continue; }
    const pay = await ns.suiteQL(
      `SELECT foreigntotal, foreignamountpaid, foreignamountunpaid FROM transaction WHERE id = ${payId}`,
    );
    console.log(`payment ${payId} (${extId}):`, JSON.stringify(pay));
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
