/**
 * Engine configuration — NS record mapping for the Shopify sync.
 * Internal ids are identical in sandbox and production (sandbox is a copy),
 * so one map serves both targets.
 *
 * Sources: owner 2026-08-17/18 (docs/SHOPIFY-SYNC.md "Accounting decisions").
 */

export interface EngineConfig {
  /** Qiqi INC — every Shopify order books here. */
  subsidiaryId: string;
  /** Payment gateway (lowercased) → clearing account internal id. */
  gatewayAccounts: Record<string, string>;
  /**
   * Pass-through tax items (Other Charge for Sale → liability accounts).
   * null = not created in NS yet → orders carrying such tax lines error
   * loudly instead of booking wrong (better no record than a bad one).
   */
  taxItems: {
    /** Merchant-liable intl VAT/duties → courier pass-through liability. */
    merchantLiable: string | null;
    /** channelLiable (Shop-remitted marketplace tax) → its own pass-through. */
    channelLiable: string | null;
  };
  /**
   * Mandatory classification defaults for created customers, copied from
   * the account's own convention on NetScore-era records (probed prod
   * 2026-08-18): B2B salons category 4 / class(custentity3) 3, B2C
   * consumers category 10 / class 4.
   */
  customerDefaults: {
    b2b: { category: string; class: string };
    b2c: { category: string; class: string };
  };
  /** Ship method for SOs carrying a shipping cost (NetScore SOs use 1171 = "FedEx/USPS/More"). */
  shipMethodId: string;
  /** Payment terms for Shopify customers: "Upfront on Sales order" (owner 2026-08-18). */
  termsId: string;
  /** "Shopify" sales-rep employee — Shopify orders have no human rep (owner 2026-08-18). */
  salesRepId: string;
  /** 3PL ship-from location (sandbox 31 "Packable - Qiqi INC"; re-verify in prod = ShipHero's location). */
  fulfillmentLocationId: string;
  /**
   * "Shopify Refund Adjustment" (OthCharge for Sale → 410000 Sales; CPA
   * may re-point). Carries refund amounts with NO inventory movement:
   * cancelled-before-fulfillment lines, kept-goods refunds, shipping and
   * amount-only residuals. (= CPA question #3, resolved 2026-08-18.)
   */
  refundAdjustmentItemId: string;
  /**
   * "Shopify Discount" Discount item → 420000 Sales Discounts. Product
   * lines book at CATALOG price; the order's total discount goes on the
   * SO/invoice header via this item — totals still match Shopify to the
   * cent, and given discounts become visible in annual reports (owner
   * 2026-08-19, QA finding on #7220).
   */
  discountItemId: string;
  /** Loop E — payout booking (CFO pattern: fee bill + journal, per payout). */
  payouts: {
    /** Vendor "Shopify Inc." for fee bills. */
    shopifyVendorId: string;
    /** 622070 Shopify Processing Fee. */
    feeExpenseAccountId: string;
    /** 100101 IDB QIQINC (USD) — where Monday deposits land. */
    bankAccountId: string;
    /** 240502 Marketplace Tax — Shop Remitted (cleared by payout tax deductions). */
    marketplaceTaxAccountId: string;
    /**
     * Chargeback/dispute account — null parks payouts containing disputes
     * (loud) until the CPA names the account.
     */
    chargebackAccountId: string | null;
  };
  /** Our externalid namespaces (NetScore never used externalid — the field is ours). */
  externalIds: {
    customer: (buyerKey: string) => string;
    salesOrder: (shopifyOrderId: string) => string;
    invoice: (shopifyOrderId: string) => string;
    payment: (shopifyTransactionId: string) => string;
  };
}

export const ENGINE_CONFIG: EngineConfig = {
  // Verified from prod data: Pure Art Salon (Shopify-era customer) carries
  // subsidiary 3 = Qiqi INC.
  subsidiaryId: '3',
  gatewayAccounts: {
    // 100501 Shopify — QIQI INC (USD): Shopify Payments + Shop Pay + Shop Cash
    shopify_payments: '1019',
    shop_cash: '1019',
    shop_pay: '1019',
    // 100504 PayPal QIQI INC (USD)
    paypal: '1021',
    // 100503 Affirm — QIQI INC (USD)
    affirm: '1026',
  },
  // Sandbox item ids (owner-created 2026-08-18): 1432 → acct 240504
  // "Duties & Taxes (DDP)", 1433 → acct 240502 "Marketplace Tax - Shop
  // Remitted". Re-verify ids in production before cutover.
  taxItems: {
    merchantLiable: '1432',
    channelLiable: '1433',
  },
  customerDefaults: {
    b2b: { category: '4', class: '3' },
    b2c: { category: '10', class: '4' },
  },
  shipMethodId: '1171',
  termsId: '8',
  salesRepId: '126620', // sandbox id; create the "Shopify" employee in prod at cutover
  fulfillmentLocationId: '31',
  refundAdjustmentItemId: '1534', // sandbox id; recreate in prod at cutover
  discountItemId: '1056', // pre-existing "Shopify Discount" item, re-pointed to 420000 (was non-posting)
  payouts: {
    shopifyVendorId: '69810', // "Shopify Inc." (active; 1992 is the inactive one)
    feeExpenseAccountId: '1859', // 622070
    bankAccountId: '938', // 100101 IDB QIQINC (USD) — owner 2026-08-19
    marketplaceTaxAccountId: '1573', // 240502
    chargebackAccountId: null, // CPA decision pending — dispute payouts park
  },

  externalIds: {
    customer: (buyerKey) => `SHOP-${buyerKey}`, // SHOP-CO-<companyId> / SHOP-CUST-<customerId>
    salesOrder: (id) => `SHOPORD-${id}`,
    invoice: (id) => `SHOPINV-${id}`,
    payment: (txnId) => `SHOPPAY-${txnId}`,
  },
};

export function gatewayAccountId(config: EngineConfig, gateway: string): string | null {
  return config.gatewayAccounts[gateway.trim().toLowerCase()] ?? null;
}
