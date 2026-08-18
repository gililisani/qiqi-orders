/**
 * Shapes for the Shopify→NS sync core.
 *
 * ShopifyOrder mirrors the subset of the Admin GraphQL order we consume
 * (exactly the ORDER_DETAIL selection in scripts/shopify/capture-fixtures.ts —
 * fixtures ARE this type). The Plan types are the pure transform output:
 * everything the engine needs to ensure NS records, with all money in
 * integer cents. NS representation decisions (tax item mapping, discount
 * representation) happen later, in the engine, driven by config — the plan
 * preserves full fidelity so those decisions stay reversible.
 */

interface MoneyBag {
  shopMoney: { amount: string; currencyCode?: string };
}

export interface ShopifyTaxLine {
  title: string;
  rate?: number | null;
  ratePercentage?: number | null;
  priceSet: MoneyBag;
}

export interface ShopifyLineItem {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  currentQuantity: number;
  requiresShipping: boolean;
  isGiftCard: boolean;
  variant: { id: string; sku: string | null; product: { id: string; productType: string | null } } | null;
  originalUnitPriceSet: MoneyBag;
  discountedUnitPriceAfterAllDiscountsSet: MoneyBag;
  originalTotalSet: MoneyBag;
  discountedTotalSet: MoneyBag;
  totalDiscountSet: MoneyBag;
  discountAllocations: Array<{ allocatedAmountSet: MoneyBag }>;
  taxLines: ShopifyTaxLine[];
}

export interface ShopifyTransaction {
  id: string;
  kind: 'SALE' | 'CAPTURE' | 'AUTHORIZATION' | 'REFUND' | 'VOID' | string;
  status: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'ERROR' | string;
  gateway: string;
  processedAt: string;
  test: boolean;
  amountSet: MoneyBag;
  parentTransaction: { id: string } | null;
  paymentId: string | null;
  fees?: Array<{ amount: { amount: string; currencyCode: string }; rate: string | null; rateName: string | null; type: string }>;
}

export interface ShopifyRefundLineItem {
  quantity: number;
  restockType: 'RETURN' | 'CANCEL' | 'NO_RESTOCK' | 'LEGACY_RESTOCK' | string;
  restocked: boolean;
  lineItem: { id: string; sku: string | null };
  subtotalSet: MoneyBag;
  totalTaxSet: MoneyBag;
}

export interface ShopifyRefund {
  id: string;
  createdAt: string;
  note: string | null;
  totalRefundedSet: MoneyBag;
  refundLineItems: { nodes: ShopifyRefundLineItem[] };
  transactions: { nodes: Array<{ id: string; kind: string; status: string; gateway: string; amountSet: MoneyBag }> };
}

export interface ShopifyFulfillment {
  id: string;
  status: string;
  createdAt: string;
  trackingInfo: Array<{ company: string | null; number: string | null; url: string | null }>;
  fulfillmentLineItems: { nodes: Array<{ quantity: number; lineItem: { id: string; sku: string | null } }> };
}

export interface ShopifyAddress {
  name: string | null;
  company: string | null;
  address1: string | null;
  city: string | null;
  provinceCode: string | null;
  zip: string | null;
  countryCodeV2: string | null;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  createdAt: string;
  processedAt: string;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  sourceName: string | null;
  test: boolean;
  confirmed: boolean;
  currencyCode: string;
  presentmentCurrencyCode: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  tags: string[];
  note: string | null;
  poNumber: string | null;
  customer: { id: string; email: string | null; firstName: string | null; lastName: string | null; tags: string[] } | null;
  purchasingEntity:
    | {
        __typename: 'PurchasingCompany';
        company: { id: string; name: string; externalId: string | null };
        location: { id: string; name: string; externalId: string | null };
        contact: { id: string; customer: { id: string; email: string | null } | null } | null;
      }
    | { __typename: 'Customer'; id: string; email: string | null }
    | null;
  billingAddress: ShopifyAddress | null;
  shippingAddress: ShopifyAddress | null;
  currentSubtotalPriceSet: MoneyBag;
  currentTotalDiscountsSet: MoneyBag;
  currentTotalTaxSet: MoneyBag;
  currentShippingPriceSet: MoneyBag;
  currentTotalPriceSet: MoneyBag;
  netPaymentSet: MoneyBag;
  totalRefundedSet: MoneyBag;
  taxesIncluded: boolean;
  taxExempt: boolean;
  taxLines: ShopifyTaxLine[];
  shippingLines: {
    nodes: Array<{
      title: string;
      code: string | null;
      originalPriceSet: MoneyBag;
      discountedPriceSet: MoneyBag;
      taxLines: ShopifyTaxLine[];
    }>;
  };
  discountApplications: { nodes: Array<Record<string, unknown>> };
  lineItems: { nodes: ShopifyLineItem[] };
  transactions: ShopifyTransaction[];
  refunds: ShopifyRefund[];
  fulfillments: ShopifyFulfillment[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type SyncErrorCode =
  | 'NOT_USD'
  | 'GIFT_CARD_LINE'
  | 'MISSING_SKU'
  | 'UNKNOWN_SKU'
  | 'TOTALS_MISMATCH'
  | 'PAYMENT_MISMATCH'
  | 'NO_LINES'
  | 'UNPARSEABLE_MONEY'
  | 'TAXES_INCLUDED'
  | 'AMBIGUOUS_CUSTOMER'
  | 'UNSUPPORTED_SOURCE';

export interface SyncIssue {
  code: SyncErrorCode;
  message: string;
  detail?: Record<string, unknown>;
}

/** Order should not sync (yet / at all) but is NOT an error. */
export type SkipReason = 'TEST_ORDER' | 'UNPAID_YET' | 'CANCELLED_UNPAID' | 'ZERO_TOTAL';

export type GateResult =
  | { outcome: 'proceed' }
  | { outcome: 'skip'; reason: SkipReason; message: string }
  | { outcome: 'error'; issues: SyncIssue[] };

// ---------------------------------------------------------------------------
// Order plan (pure transform output, engine input)
// ---------------------------------------------------------------------------

export interface PlanTaxLine {
  /** Shopify jurisdiction title, preserved verbatim ("New York State Tax"). */
  title: string;
  ratePercentage: number | null;
  amountCents: number;
}

export interface PlanLine {
  shopifyLineItemId: string;
  sku: string;
  description: string;
  quantity: number;
  /** Catalog unit price at order time (pre-discount), cents. */
  originalUnitPriceCents: number;
  /** What the customer actually paid for the line (post-discount, ex tax), cents. */
  netAmountCents: number;
  discountCents: number;
  taxLines: PlanTaxLine[];
}

export interface PlanPayment {
  shopifyTransactionId: string;
  gateway: string;
  amountCents: number;
  processedAt: string;
  feeCents: number | null;
}

/**
 * NOTE ON STATE: `lines` are AS-SOLD (original quantities/amounts — what
 * the SO+Invoice must book); `totals` are CURRENT-state (post-refund).
 * For orders without refunds/edits the two coincide. Loop C reconciles
 * the difference via credit memos.
 */
export interface OrderPlan {
  shopifyOrderId: string; // numeric part, e.g. "7530826367031"
  orderName: string; // "#7246"
  processedAt: string;
  poNumber: string | null;
  note: string | null;
  buyer: BuyerInfo;
  lines: PlanLine[];
  /** Order-level tax lines (jurisdiction-distinct, verbatim titles). */
  taxLines: PlanTaxLine[];
  shipping: { title: string; amountCents: number; taxLines: PlanTaxLine[] } | null;
  payments: PlanPayment[];
  totals: {
    subtotalCents: number; // post-discount, ex tax + shipping
    discountCents: number;
    shippingCents: number;
    taxCents: number;
    totalCents: number; // what the customer was charged
  };
  discountCodes: string[];
}

// ---------------------------------------------------------------------------
// Customer matching
// ---------------------------------------------------------------------------

export interface BuyerInfo {
  kind: 'b2b' | 'b2c';
  shopifyCustomerId: string | null; // numeric
  shopifyCompanyId: string | null; // numeric, b2b only
  shopifyCompanyLocationId: string | null;
  companyName: string | null;
  email: string | null; // normalized (lowercase, trimmed)
  displayName: string;
}

/** One NS customer candidate, as found by the engine's lookups. */
export interface NsCustomerCandidate {
  nsCustomerId: string;
  entityId: string;
  companyName: string | null;
  email: string | null;
  isInactive: boolean;
  /** Which lookup produced it. */
  via: 'company_stamp' | 'customer_stamp' | 'email';
}

export type MatchDecision =
  | { action: 'use'; nsCustomerId: string; via: NsCustomerCandidate['via']; stampNeeded: boolean }
  | { action: 'create'; stamp: { shopifyCustomerId: string | null; shopifyCompanyId: string | null } }
  | { action: 'error'; issue: SyncIssue };
