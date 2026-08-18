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
  taxItems: {
    merchantLiable: null, // pending: pass-through items to be created in NS
    channelLiable: null,
  },
  customerDefaults: {
    b2b: { category: '4', class: '3' },
    b2c: { category: '10', class: '4' },
  },
  shipMethodId: '1171',
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
