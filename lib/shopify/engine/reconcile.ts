/**
 * L3 ENGINE — Loop D: nightly reconciliation (the backstop for every
 * other loop). For each Shopify order created in the window:
 *
 *   1. A state row must exist — a missing one is the NetScore lost-order
 *      bug resurfacing → MISSING_ORDER card in the error queue.
 *   2. Synced orders must verify against NS BY EXTERNALID, to the cent:
 *      SO + invoice exist, invoice total == as-sold Shopify total,
 *      every payment / fulfillment / credit memo of the plan exists,
 *      each CM total == its refund's amount → RECON_MISMATCH card.
 *
 * NetScore-era orders (SalesOrd stamp in the snapshot) are their history —
 * counted, never checked, never re-booked. Infra failures (NS/Shopify
 * unreachable) THROW — a failed recon run must never card healthy orders.
 */
import { gateOrder } from '../core/validate';
import { buildOrderPlan } from '../core/orderTransform';
import { buildFulfillmentPlans } from '../core/fulfillmentTransform';
import { buildRefundPlans } from '../core/refundTransform';
import type { OrderPlan, ShopifyOrder } from '../core/types';
import type { ShopifySyncStore } from '../store';
import type { NsApi } from './pipeline';
import type { EngineConfig } from './config';

export interface ReconcileDeps {
  store: ShopifySyncStore;
  ns: NsApi;
  config: EngineConfig;
  nsTarget: 'sandbox' | 'production';
  fetchOrdersCreatedBetween: (fromIso: string, toIso: string) => Promise<ShopifyOrder[]>;
  loadKnownSkus: () => Promise<Set<string>>;
  /** Window override for script-driven historical sweeps. */
  window?: { fromIso: string; toIso: string };
  now?: () => Date;
}

export interface ReconcileResult {
  window: { from: string; to: string };
  fetched: number;
  checked: number;
  clean: number;
  flagged: Array<{ order: string; code: 'MISSING_ORDER' | 'RECON_MISMATCH'; message: string }>;
  netscoreEra: number;
  skippedOrIgnored: number;
  alreadyError: number;
}

/** As-sold invoice total: lines (catalog − discount nets out) + shipping + tax/duties. */
export function expectedInvoiceCents(plan: OrderPlan): number {
  return (
    plan.lines.reduce((s, l) => s + l.netAmountCents, 0) +
    (plan.shipping?.amountCents ?? 0) +
    plan.taxLines.reduce((s, t) => s + t.amountCents, 0) +
    (plan.fxAdjustmentCents ?? 0)
  );
}

/** Poller grace: orders younger than this are still the poller's turf. */
const MIN_AGE_MS = 60 * 60_000;
/** Default recon window: the last two days, re-checked idempotently. */
const WINDOW_HOURS = 48;

export async function reconcileOrders(deps: ReconcileDeps): Promise<ReconcileResult> {
  const { store, ns, nsTarget } = deps;
  const now = deps.now ?? (() => new Date());
  const nowMs = now().getTime();
  const from = deps.window?.fromIso ?? new Date(nowMs - WINDOW_HOURS * 3600_000).toISOString();
  const to = deps.window?.toIso ?? new Date(nowMs).toISOString();

  const orders = await deps.fetchOrdersCreatedBetween(from, to);
  const knownSkus = orders.length > 0 ? await deps.loadKnownSkus() : new Set<string>();
  const aliases = await store.getSkuAliases();
  for (const sku of aliases.keys()) knownSkus.add(sku);

  const result: ReconcileResult = {
    window: { from, to },
    fetched: orders.length,
    checked: 0,
    clean: 0,
    flagged: [],
    netscoreEra: 0,
    skippedOrIgnored: 0,
    alreadyError: 0,
  };

  for (const order of orders) {
    const orderId = order.id.replace(/^.*\//, '');

    // NetScore-era orders are their books, not ours.
    if (nsTarget === 'production' && (await store.hasNetscoreSalesOrder(orderId))) {
      result.netscoreEra += 1;
      continue;
    }

    let row = await store.getOrderRow(orderId);

    if (!row) {
      const gate = gateOrder(order, knownSkus);
      if (gate.outcome === 'skip') {
        // Legitimately unsynced (test/unpaid/zero) — record it so the next
        // recon and the dashboard both see why.
        await store.seenOrder(order, null);
        await store.markSkipped(orderId, gate.reason, gate.message);
        result.clean += 1;
        result.checked += 1;
        continue;
      }
      if (new Date(order.createdAt).getTime() > nowMs - MIN_AGE_MS) continue; // poller's turf still

      // The state row may be missing while the NS chain exists (state DB
      // reset, pre-persistence backfill runs). Adopt: heal the row and let
      // the verification below judge the chain — never a false alarm.
      if (gate.outcome === 'proceed') {
        const soId = await ns.findRecordIdByExternalId(
          'salesOrder',
          deps.config.externalIds.salesOrder(orderId),
        );
        if (soId) {
          await store.seenOrder(order, buildOrderPlan(order));
          await store.setState(orderId, 'paid', { ns_target: nsTarget, ns_so_id: soId });
          await store.event('orders', 'recon_adopted', orderId, { soId });
          // Fall through to full verification below with the healed row.
          row = { state: 'paid', ns_target: nsTarget };
        } else {
          const message = `${order.name} exists in Shopify but was never synced (poller missed it) — Retry books it`;
          await store.seenOrder(order, buildOrderPlan(order));
          await store.markError(orderId, [{ code: 'MISSING_ORDER', message }]);
          await store.event('orders', 'recon_missing', orderId, {});
          result.flagged.push({ order: order.name, code: 'MISSING_ORDER', message });
          result.checked += 1;
          continue;
        }
      } else {
        const message = `${order.name} exists in Shopify but was never synced and no longer gates clean — investigate`;
        await store.seenOrder(order, null);
        await store.markError(orderId, [{ code: 'MISSING_ORDER', message }]);
        await store.event('orders', 'recon_missing', orderId, {});
        result.flagged.push({ order: order.name, code: 'MISSING_ORDER', message });
        result.checked += 1;
        continue;
      }
    }

    if (!row) continue; // unreachable: every no-row path above continues or heals

    if (row.state === 'skipped' || row.state === 'ignored') {
      result.skippedOrIgnored += 1;
      continue;
    }
    if (row.state === 'error') {
      result.alreadyError += 1;
      continue;
    }
    if (row.state === 'pending') {
      // Planned but never executed. In write modes that means the executor
      // died silently — surface it once the poller has had its chance.
      if (new Date(order.createdAt).getTime() > nowMs - MIN_AGE_MS) continue;
      const message = `${order.name} was planned but never booked to NS — Retry books it`;
      await store.markError(orderId, [{ code: 'MISSING_ORDER', message }]);
      await store.event('orders', 'recon_stale_pending', orderId, {});
      result.flagged.push({ order: order.name, code: 'MISSING_ORDER', message });
      result.checked += 1;
      continue;
    }
    if (row.ns_target && row.ns_target !== nsTarget) {
      // Booked against the other NS (sandbox rows after cutover) — not
      // verifiable against this target; leave for the mode switch cleanup.
      result.skippedOrIgnored += 1;
      continue;
    }

    // ---- synced order: verify the NS chain by externalid, to the cent ----
    const gate = gateOrder(order, knownSkus);
    if (gate.outcome !== 'proceed') {
      // Order mutated into an unsyncable shape after booking — loud.
      const message = `${order.name} no longer gates clean after booking (${gate.outcome}) — investigate`;
      await store.markError(orderId, [{ code: 'RECON_MISMATCH', message }]);
      result.flagged.push({ order: order.name, code: 'RECON_MISMATCH', message });
      result.checked += 1;
      continue;
    }
    const plan = buildOrderPlan(order);
    const problems: string[] = [];
    const cfg = deps.config;

    const soId = await ns.findRecordIdByExternalId('salesOrder', cfg.externalIds.salesOrder(orderId));
    if (!soId) problems.push('sales order missing in NS');

    const invId = await ns.findRecordIdByExternalId('invoice', cfg.externalIds.invoice(orderId));
    if (!invId) {
      problems.push('invoice missing in NS');
    } else {
      const rows = await ns.suiteQL<{ foreigntotal: string }>(
        `SELECT foreigntotal FROM transaction WHERE id = ${Number(invId)}`,
      );
      const nsCents = Math.round(Math.abs(Number(rows[0]?.foreigntotal ?? 0)) * 100);
      const expected = expectedInvoiceCents(plan);
      if (nsCents !== expected) {
        problems.push(`invoice total ${(nsCents / 100).toFixed(2)} != Shopify as-sold ${(expected / 100).toFixed(2)}`);
      }
    }

    for (const p of plan.payments) {
      const payId = await ns.findRecordIdByExternalId('customerpayment', cfg.externalIds.payment(p.shopifyTransactionId));
      if (!payId) problems.push(`payment ${p.gateway} $${(p.amountCents / 100).toFixed(2)} missing in NS`);
    }

    for (const f of buildFulfillmentPlans(order)) {
      const ifId = await ns.findRecordIdByExternalId('itemFulfillment', `SHOPFUL-${f.shopifyFulfillmentId}`);
      if (!ifId) problems.push(`item fulfillment ${f.shopifyFulfillmentId} missing in NS`);
    }

    const { plans: refundPlans } = buildRefundPlans(order);
    for (const r of refundPlans) {
      const cmId = await ns.findRecordIdByExternalId('creditMemo', `SHOPCM-${r.shopifyRefundId}`);
      if (!cmId) {
        problems.push(`credit memo for refund ${r.shopifyRefundId} missing in NS`);
        continue;
      }
      const rows = await ns.suiteQL<{ foreigntotal: string }>(
        `SELECT foreigntotal FROM transaction WHERE id = ${Number(cmId)}`,
      );
      const nsCents = Math.round(Math.abs(Number(rows[0]?.foreigntotal ?? 0)) * 100);
      const expected =
        r.lines.reduce((s, l) => s + l.subtotalCents + l.taxCents, 0) + r.residualCents;
      if (nsCents !== expected) {
        problems.push(
          `credit memo ${r.shopifyRefundId} total ${(nsCents / 100).toFixed(2)} != refund ${(expected / 100).toFixed(2)}`,
        );
      }
    }

    result.checked += 1;
    if (problems.length > 0) {
      const message = `${order.name}: ${problems.join('; ')}`;
      await store.markError(orderId, [{ code: 'RECON_MISMATCH', message }]);
      await store.event('orders', 'recon_mismatch', orderId, { problems });
      result.flagged.push({ order: order.name, code: 'RECON_MISMATCH', message });
    } else {
      result.clean += 1;
    }
  }

  await store.event('system', 'recon_complete', null, {
    window: result.window,
    fetched: result.fetched,
    checked: result.checked,
    clean: result.clean,
    flagged: result.flagged.length,
    netscoreEra: result.netscoreEra,
  });
  return result;
}
