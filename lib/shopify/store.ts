/**
 * L4 STATE — repositories over the shopify_* tables. Service-role only
 * (called from the engine / cron routes; never from the browser).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderPlan, ShopifyOrder, SkipReason, SyncIssue } from './core/types';

export type SyncMode = 'off' | 'shadow' | 'sandbox' | 'live';

export interface SyncConfig {
  mode: SyncMode;
  orders_cursor: string | null;
  fulfillments_cursor: string | null;
  payouts_cursor: string | null;
  last_poll_at: string | null;
  last_poll_error: string | null;
}

export class ShopifySyncStore {
  constructor(private readonly db: SupabaseClient) {}

  async getConfig(): Promise<SyncConfig> {
    const { data, error } = await this.db.from('shopify_sync_config').select('*').eq('id', 1).single();
    if (error) throw new Error(`shopify_sync_config read failed: ${error.message}`);
    return data as SyncConfig;
  }

  async updateConfig(patch: Partial<SyncConfig>): Promise<void> {
    const { error } = await this.db
      .from('shopify_sync_config')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) throw new Error(`shopify_sync_config update failed: ${error.message}`);
  }

  /** Upsert the base row for an order seen by the poller. */
  async seenOrder(order: ShopifyOrder, plan: OrderPlan | null): Promise<void> {
    const num = (gid: string) => gid.replace(/^.*\//, '');
    const row = {
      shopify_order_id: num(order.id),
      order_name: order.name,
      order_created_at: order.createdAt,
      shopify_updated_at: (order as any).updatedAt ?? null,
      buyer_kind: plan?.buyer.kind ?? null,
      shopify_customer_id: plan?.buyer.shopifyCustomerId ?? null,
      shopify_company_id: plan?.buyer.shopifyCompanyId ?? null,
      total_cents: plan?.totals.totalCents ?? null,
      tax_cents: plan?.totals.taxCents ?? null,
      shipping_cents: plan?.totals.shippingCents ?? null,
      plan: plan as unknown as Record<string, unknown> | null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.db
      .from('shopify_order_sync')
      .upsert(row, { onConflict: 'shopify_order_id', ignoreDuplicates: false });
    if (error) throw new Error(`shopify_order_sync upsert failed (${order.name}): ${error.message}`);
  }

  async setState(
    shopifyOrderId: string,
    state: string,
    fields: Record<string, unknown> = {},
  ): Promise<void> {
    const { error } = await this.db
      .from('shopify_order_sync')
      .update({ state, ...fields, updated_at: new Date().toISOString() })
      .eq('shopify_order_id', shopifyOrderId);
    if (error) throw new Error(`shopify_order_sync setState failed (${shopifyOrderId}): ${error.message}`);
  }

  async markSkipped(shopifyOrderId: string, reason: SkipReason, message: string): Promise<void> {
    await this.setState(shopifyOrderId, 'skipped', { skip_reason: reason, error_message: message });
  }

  async markError(shopifyOrderId: string, issues: SyncIssue[]): Promise<void> {
    await this.setState(shopifyOrderId, 'error', {
      error_code: issues[0]?.code ?? 'UNKNOWN',
      error_message: issues.map((i) => i.message).join(' | ').slice(0, 2000),
      error_detail: { issues } as unknown as Record<string, unknown>,
    });
  }

  async getOrderState(shopifyOrderId: string): Promise<{ state: string; retry_count: number } | null> {
    const { data, error } = await this.db
      .from('shopify_order_sync')
      .select('state, retry_count')
      .eq('shopify_order_id', shopifyOrderId)
      .maybeSingle();
    if (error) throw new Error(`shopify_order_sync read failed: ${error.message}`);
    return data as any;
  }

  async event(
    loop: 'orders' | 'fulfillments' | 'refunds' | 'reconcile' | 'payouts' | 'system',
    event: string,
    shopifyOrderId: string | null = null,
    detail: Record<string, unknown> | null = null,
  ): Promise<void> {
    const { error } = await this.db
      .from('shopify_sync_events')
      .insert({ loop, event, shopify_order_id: shopifyOrderId, detail });
    if (error) {
      // The event log must never take down a sync run.
      console.error(`[shopify-sync] event insert failed: ${error.message}`);
    }
  }
}
