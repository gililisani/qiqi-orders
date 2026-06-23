/**
 * ShipHero configuration, read from env. Server-only — these are secrets and
 * must never reach a 'use client' file. Mirrors the `createNetSuiteAPI()` /
 * `createStripeClient()` factory style.
 *
 * Account context (confirmed live 2026-06-23): our Third-Party Developer token
 * is on BrandFox's MASTER 3PL account, so every order/webhook MUST be scoped to
 * Qiqi via `customer_account_id`. The dry-run gate defaults ON so nothing hits
 * the live account until explicitly enabled.
 */

export interface ShipHeroConfig {
  /** Long-lived refresh token (the durable secret). Required. */
  refreshToken: string;
  /** Seed access token (~28d). Optional — we can mint one from the refresh token. */
  accessToken: string | null;
  /**
   * Qiqi's ShipHero customer/sub-account id under BrandFox (the "97016").
   * Required for order_create + webhook_create so writes are scoped to Qiqi.
   * PENDING final confirmation from BrandFox.
   */
  customerAccountId: string | null;
  /**
   * Optional warehouse global id to pin line-item allocation. ShipHero otherwise
   * allocates by customer account, so this is not required for order_create.
   */
  warehouseId: string | null;
  /** Shop label shown in ShipHero. */
  shopName: string;
  /** Secret carried in the webhook callback URL (?token=) for verification. */
  webhookSecret: string | null;
  /**
   * Dry-run gate. TRUE (suppress live mutations) unless SHIPHERO_DRY_RUN is the
   * literal string "false". Fail-safe: any other value keeps us in dry-run.
   */
  dryRun: boolean;
}

export function getShipHeroConfig(): ShipHeroConfig {
  const refreshToken = process.env.SHIPHERO_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error('SHIPHERO_REFRESH_TOKEN is not set. Add the ShipHero refresh token to the environment.');
  }

  return {
    refreshToken,
    accessToken: process.env.SHIPHERO_ACCESS_TOKEN || null,
    customerAccountId: process.env.SHIPHERO_CUSTOMER_ACCOUNT_ID || null,
    warehouseId: process.env.SHIPHERO_WAREHOUSE_ID || null,
    shopName: process.env.SHIPHERO_SHOP_NAME || 'Qiqi Hub',
    webhookSecret: process.env.SHIPHERO_WEBHOOK_SECRET || null,
    // Live mutations require an explicit opt-out of dry-run.
    dryRun: process.env.SHIPHERO_DRY_RUN !== 'false',
  };
}
