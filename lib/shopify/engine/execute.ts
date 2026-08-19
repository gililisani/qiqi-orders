/**
 * L3 ENGINE — per-order executor: chains Loop A (customer/SO/invoice/
 * payments), Loop B (item fulfillments) and Loop C (credit memos/refunds)
 * for one order. Called by the poller in sandbox/live modes; every step
 * is an ensure, so re-execution after any partial failure is safe.
 */
import type { ShopifyOrder } from '../core/types';
import type { OrderPlan } from '../core/types';
import { buildFulfillmentPlans } from '../core/fulfillmentTransform';
import { buildRefundPlans } from '../core/refundTransform';
import { runOrderPipeline, PipelineError, type NsApi } from './pipeline';
import { ensureItemFulfillments } from './fulfill';
import { ensureRefunds } from './refund';
import type { EngineConfig } from './config';

export interface ExecutionOutcome {
  state: 'paid' | 'fulfilled' | 'refunded';
  nsIds: {
    ns_customer_id: string;
    ns_so_id: string;
    ns_invoice_id: string;
    ns_payment_ids: string[];
    ns_fulfillment_ids: string[];
    ns_credit_memo_ids: string[];
  };
}

export async function executeOrder(
  order: ShopifyOrder,
  plan: OrderPlan,
  ns: NsApi,
  config: EngineConfig,
): Promise<ExecutionOutcome> {
  // Loop A — the money chain.
  const a = await runOrderPipeline(plan, ns, config);

  // Loop B — one IF per Shopify fulfillment.
  const fulfillmentPlans = buildFulfillmentPlans(order);
  const b = await ensureItemFulfillments(fulfillmentPlans, a.nsSoId, ns, config);

  // Loop C — refunds, if any.
  const { plans: refundPlans, issues } = buildRefundPlans(order);
  if (issues.length > 0) {
    throw new PipelineError(issues[0]);
  }
  const c = await ensureRefunds(refundPlans, plan, a.nsCustomerId, ns, config, {
    orderHasNsFulfillment: b.nsFulfillmentIds.length > 0,
  });

  const state = c.nsCreditMemoIds.length > 0 ? 'refunded' : b.nsFulfillmentIds.length > 0 ? 'fulfilled' : 'paid';

  return {
    state,
    nsIds: {
      ns_customer_id: a.nsCustomerId,
      ns_so_id: a.nsSoId,
      ns_invoice_id: a.nsInvoiceId,
      ns_payment_ids: a.nsPaymentIds,
      ns_fulfillment_ids: b.nsFulfillmentIds,
      ns_credit_memo_ids: c.nsCreditMemoIds,
    },
  };
}
