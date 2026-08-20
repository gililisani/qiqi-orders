/**
 * Shared self-service engine entry: fetch ONE order fresh from Shopify,
 * gate it (with SKU aliases), execute it, persist the outcome. Used by
 * the dashboard's Retry / Resolve-customer / Map-SKU / Import actions —
 * idempotent by construction, so every button is always safe.
 */
import { shopifyGraphQL } from '../client';
import { ORDER_SELECTION } from '../orderQuery';
import { gateOrder } from '../core/validate';
import { buildOrderPlan } from '../core/orderTransform';
import type { ShopifyOrder } from '../core/types';
import { executeOrder } from './execute';
import { PipelineError } from './pipeline';
import { ENGINE_CONFIG } from './config';
import { loadKnownSkus } from './deps';
import { createNetSuiteForTarget, type NsTarget } from './nsTarget';
import type { ShopifySyncStore } from '../store';

export type RetryResult =
  | { result: 'ok'; state: string; orderName: string }
  | { result: 'skipped'; reason: string; message: string; orderName: string }
  | { result: 'still_error'; issues: Array<{ code: string; message: string }>; orderName: string }
  | { result: 'not_found' };

export async function fetchOrderById(shopifyOrderId: string): Promise<ShopifyOrder | null> {
  const data = await shopifyGraphQL(
    `query One($id: ID!) { order: node(id: $id) { ... on Order { ${ORDER_SELECTION} } } }`,
    { id: `gid://shopify/Order/${shopifyOrderId}` },
  );
  return data.order?.id ? (data.order as ShopifyOrder) : null;
}

export async function fetchOrderByName(name: string): Promise<ShopifyOrder | null> {
  const clean = name.startsWith('#') ? name : `#${name}`;
  const data = await shopifyGraphQL(
    `query ByName($q: String!) { orders(first: 5, query: $q) { nodes { ${ORDER_SELECTION} } } }`,
    { q: `name:${clean}` },
  );
  return (data.orders.nodes as ShopifyOrder[]).find((o) => o.name === clean) ?? null;
}

export async function retryOrder(order: ShopifyOrder, store: ShopifySyncStore): Promise<RetryResult> {
  const config = await store.getConfig();
  if (config.mode !== 'sandbox' && config.mode !== 'live') {
    throw new Error(`Sync mode is '${config.mode}' — retries only run in sandbox/live`);
  }
  const nsTarget: NsTarget = config.mode === 'live' ? 'production' : 'sandbox';
  const ns = createNetSuiteForTarget(nsTarget);
  const shopifyOrderId = order.id.replace(/^.*\//, '');

  const aliases = await store.getSkuAliases();
  const knownSkus = await loadKnownSkus();
  for (const sku of aliases.keys()) knownSkus.add(sku);

  const gate = gateOrder(order, knownSkus);
  if (gate.outcome === 'skip') {
    await store.seenOrder(order, null);
    await store.markSkipped(shopifyOrderId, gate.reason, gate.message);
    return { result: 'skipped', reason: gate.reason, message: gate.message, orderName: order.name };
  }
  if (gate.outcome === 'error') {
    await store.seenOrder(order, null);
    await store.markError(shopifyOrderId, gate.issues);
    return { result: 'still_error', issues: gate.issues, orderName: order.name };
  }

  const plan = buildOrderPlan(order);
  await store.seenOrder(order, plan);
  try {
    const outcome = await executeOrder(order, plan, ns, ENGINE_CONFIG, {
      skuOverrides: aliases,
      stampCandidates: (sid) => store.stampCandidates(sid, nsTarget),
    });
    await store.setState(shopifyOrderId, outcome.state, {
      ...outcome.nsIds,
      ns_target: nsTarget,
      error_code: null,
      error_message: null,
      skip_reason: null,
      ignore_note: null,
    });
    await store.event('orders', 'retried_ok', shopifyOrderId, { state: outcome.state });
    return { result: 'ok', state: outcome.state, orderName: order.name };
  } catch (err: any) {
    const issue =
      err instanceof PipelineError
        ? err.issue
        : { code: 'UNSUPPORTED_SOURCE' as const, message: String(err?.message ?? err).slice(0, 500) };
    await store.markError(shopifyOrderId, [issue]);
    await store.event('orders', 'retried_error', shopifyOrderId, { issue });
    return { result: 'still_error', issues: [issue], orderName: order.name };
  }
}
