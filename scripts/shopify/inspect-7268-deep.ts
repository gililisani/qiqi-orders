import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { shopifyGraphQL } from '../../lib/shopify/client';

async function main() {
  const d = await shopifyGraphQL(`{
    order: node(id: "gid://shopify/Order/7534487240759") {
      ... on Order {
        name
        displayFinancialStatus
        originalTotalPriceSet { shopMoney { amount } }
        netPaymentSet { shopMoney { amount } }
        totalRefundedSet { shopMoney { amount } }
        transactions(first: 10) { kind status gateway amountSet { shopMoney { amount } } }
        currentSubtotalPriceSet { shopMoney { amount } }
        currentTotalPriceSet { shopMoney { amount } }
        currentShippingPriceSet { shopMoney { amount } }
        currentTotalDiscountsSet { shopMoney { amount } }
        discountApplications(first: 10) {
          nodes {
            __typename targetType targetSelection allocationMethod
            ... on DiscountCodeApplication { code }
            ... on AutomaticDiscountApplication { title }
            value { __typename ... on MoneyV2 { amount } ... on PricingPercentageValue { percentage } }
          }
        }
        shippingLines(first: 5) {
          nodes {
            title
            originalPriceSet { shopMoney { amount } }
            discountedPriceSet { shopMoney { amount } }
            discountAllocations { allocatedAmountSet { shopMoney { amount } } }
          }
        }
        lineItems(first: 20) {
          nodes {
            sku quantity currentQuantity
            originalTotalSet { shopMoney { amount } }
            discountedTotalSet { shopMoney { amount } }
            discountAllocations { allocatedAmountSet { shopMoney { amount } } }
          }
        }
      }
    }
  }`);
  console.log(JSON.stringify(d.order, null, 1));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
