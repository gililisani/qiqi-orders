/**
 * L4 STATE — repositories over the shopify_* tables. Service-role only
 * (called from the engine / cron routes; never from the browser).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NsCustomerCandidate, OrderPlan, ShopifyOrder, SkipReason, SyncIssue } from './core/types';

export type SyncMode = 'off' | 'shadow' | 'sandbox' | 'live';

export interface SyncConfig {
  mode: SyncMode;
  orders_cursor: string | null;
  fulfillments_cursor: string | null;
  payouts_cursor: string | null;
  last_poll_at: string | null;
  last_poll_error: string | null;
  /** Cached store-wide financials (lib/shopify/financialSnapshot.ts), refreshed by the poll cron. */
  financial_snapshot?: Record<string, unknown> | null;
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

  async getOrderState(shopifyOrderId: string): Promise<{
    state: string;
    retry_count: number;
    shopify_updated_at: string | null;
    executed_shopify_updated_at: string | null;
  } | null> {
    const { data, error } = await this.db
      .from('shopify_order_sync')
      .select('state, retry_count, shopify_updated_at, executed_shopify_updated_at')
      .eq('shopify_order_id', shopifyOrderId)
      .maybeSingle();
    if (error) throw new Error(`shopify_order_sync read failed: ${error.message}`);
    return data as any;
  }

  /** Full state row for Loop D reconciliation. */
  async getOrderRow(shopifyOrderId: string): Promise<Record<string, any> | null> {
    const { data, error } = await this.db
      .from('shopify_order_sync')
      .select('state, skip_reason, error_code, ns_target, ns_so_id, ns_invoice_id, ns_payment_ids, ns_fulfillment_ids, ns_credit_memo_ids, updated_at')
      .eq('shopify_order_id', shopifyOrderId)
      .maybeSingle();
    if (error) throw new Error(`shopify_order_sync read failed: ${error.message}`);
    return data as any;
  }

  /**
   * True when NetScore booked this order (a SalesOrd stamp exists in the
   * snapshot). Cutover guard: such orders never re-enter our pipeline on
   * the production target — their NS chain is NetScore's history.
   */
  async hasNetscoreSalesOrder(shopifyOrderId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('netscore_transaction_stamps')
      .select('ns_transaction_id')
      .eq('shopify_order_id', shopifyOrderId)
      .eq('ns_target', 'production')
      .eq('tran_type', 'SalesOrd')
      .limit(1);
    if (error) throw new Error(`netscore_transaction_stamps read failed: ${error.message}`);
    return (data ?? []).length > 0;
  }

  async markIgnored(shopifyOrderId: string, note: string): Promise<void> {
    await this.setState(shopifyOrderId, 'ignored', { ignore_note: note.slice(0, 500) });
  }

  /** NetScore-era customer stamps (snapshotted before their bundle died). */
  async stampCandidates(shopifyCustomerId: string, nsTarget: 'sandbox' | 'production'): Promise<NsCustomerCandidate[]> {
    const { data, error } = await this.db
      .from('netscore_customer_stamps')
      .select('ns_customer_id, entity_id, company_name, email, is_inactive')
      .eq('shopify_customer_id', shopifyCustomerId)
      .eq('ns_target', nsTarget);
    if (error) throw new Error(`netscore_customer_stamps read failed: ${error.message}`);
    return (data ?? []).map((r) => ({
      nsCustomerId: String(r.ns_customer_id),
      entityId: r.entity_id ?? '',
      companyName: r.company_name,
      email: r.email,
      isInactive: !!r.is_inactive,
      via: 'customer_stamp' as const,
    }));
  }

  /** Shopify SKU → NS item id aliases (permanent, admin-created). */
  async getSkuAliases(): Promise<Map<string, string>> {
    const { data, error } = await this.db.from('shopify_sku_aliases').select('shopify_sku, ns_item_id');
    if (error) throw new Error(`shopify_sku_aliases read failed: ${error.message}`);
    return new Map((data ?? []).map((r) => [r.shopify_sku, r.ns_item_id]));
  }

  async addSkuAlias(shopifySku: string, nsItemId: string, note?: string): Promise<void> {
    const { error } = await this.db
      .from('shopify_sku_aliases')
      .upsert({ shopify_sku: shopifySku, ns_item_id: nsItemId, note: note ?? null });
    if (error) throw new Error(`shopify_sku_aliases upsert failed: ${error.message}`);
  }

  async upsertPayout(row: {
    shopify_payout_id: string;
    issued_at: string;
    status: string;
    net_cents: number;
    fee_cents: number;
    state: 'pending' | 'booked' | 'error';
    ns_target?: string | null;
    ns_fee_bill_id?: string | null;
    ns_fee_payment_id?: string | null;
    ns_journal_id?: string | null;
    composition?: Record<string, unknown> | null;
    error_message?: string | null;
  }): Promise<void> {
    const { error } = await this.db
      .from('shopify_payout_sync')
      .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'shopify_payout_id' });
    if (error) throw new Error(`shopify_payout_sync upsert failed: ${error.message}`);
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
