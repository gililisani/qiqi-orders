import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { shopifyGraphQL } from '../../lib/shopify/client';

async function main() {
  const d = await shopifyGraphQL(`{
    order: node(id: "gid://shopify/Order/7534487240759") {
      ... on Order {
        currentTotalDutiesSet { shopMoney { amount } }
        originalTotalDutiesSet { shopMoney { amount } }
        lineItems(first: 20) {
          nodes {
            sku
            duties { id price { shopMoney { amount } } taxLines { title ratePercentage priceSet { shopMoney { amount } } } }
          }
        }
      }
    }
  }`);
  console.log(JSON.stringify(d.order, null, 1));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
