/**
 * Canonical GraphQL selection for an order — the single source of truth
 * for what the sync consumes. Fixtures were captured with this exact
 * shape (scripts/shopify/capture-fixtures.ts), so core/types.ts
 * ShopifyOrder and this selection must evolve together.
 */
export const ORDER_SELECTION = `
  id name createdAt processedAt closedAt cancelledAt cancelReason
  sourceName test confirmed
  currencyCode presentmentCurrencyCode
  displayFinancialStatus displayFulfillmentStatus
  tags note poNumber
  updatedAt
  customer { id email firstName lastName numberOfOrders tags }
  purchasingEntity {
    __typename
    ... on PurchasingCompany {
      company { id name externalId }
      location { id name externalId }
      contact { id customer { id email } }
    }
    ... on Customer { id email }
  }
  billingAddress { name company address1 city provinceCode zip countryCodeV2 }
  shippingAddress { name company address1 city provinceCode zip countryCodeV2 }
  currentSubtotalPriceSet { shopMoney { amount currencyCode } }
  currentTotalDiscountsSet { shopMoney { amount } }
  currentTotalTaxSet { shopMoney { amount } }
  currentTotalDutiesSet { shopMoney { amount } }
  currentShippingPriceSet { shopMoney { amount } }
  currentTotalPriceSet { shopMoney { amount currencyCode } }
  originalTotalPriceSet { shopMoney { amount } }
  netPaymentSet { shopMoney { amount } }
  totalRefundedSet { shopMoney { amount } }
  taxesIncluded taxExempt
  taxLines { title rate ratePercentage channelLiable priceSet { shopMoney { amount } } }
  discountApplications(first: 10) {
    nodes {
      __typename allocationMethod targetSelection targetType
      ... on DiscountCodeApplication { code }
      ... on AutomaticDiscountApplication { title }
      ... on ManualDiscountApplication { title description }
      value { __typename ... on MoneyV2 { amount } ... on PricingPercentageValue { percentage } }
    }
  }
  shippingLines(first: 5) {
    nodes {
      title code source
      originalPriceSet { shopMoney { amount } }
      discountedPriceSet { shopMoney { amount } }
      taxLines { title ratePercentage channelLiable priceSet { shopMoney { amount } } }
    }
  }
  lineItems(first: 50) {
    nodes {
      id name sku quantity currentQuantity refundableQuantity
      vendor requiresShipping isGiftCard
      variant { id sku barcode product { id productType } }
      originalUnitPriceSet { shopMoney { amount } }
      discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount } }
      originalTotalSet { shopMoney { amount } }
      discountedTotalSet { shopMoney { amount } }
      totalDiscountSet { shopMoney { amount } }
      discountAllocations { allocatedAmountSet { shopMoney { amount } } discountApplication { __typename } }
      taxLines { title rate ratePercentage channelLiable priceSet { shopMoney { amount } } }
    }
  }
  transactions(first: 20) {
    id kind status gateway processedAt test
    amountSet { shopMoney { amount currencyCode } }
    parentTransaction { id }
    paymentId formattedGateway
    fees { amount { amount currencyCode } rate rateName type }
  }
  refunds(first: 10) {
    id createdAt note
    totalRefundedSet { shopMoney { amount } }
    refundLineItems(first: 50) {
      nodes {
        quantity restockType restocked
        lineItem { id sku }
        priceSet { shopMoney { amount } }
        subtotalSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
      }
    }
    transactions(first: 10) { nodes { id kind status gateway amountSet { shopMoney { amount } } } }
  }
  fulfillments(first: 10) {
    id status createdAt
    trackingInfo { company number url }
    fulfillmentLineItems(first: 50) { nodes { quantity lineItem { id sku } } }
  }
`;

export const ORDERS_UPDATED_SINCE_QUERY = `
  query OrdersUpdatedSince($q: String!, $cursor: String) {
    orders(first: 25, after: $cursor, sortKey: UPDATED_AT, query: $q) {
      nodes { ${ORDER_SELECTION} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;
