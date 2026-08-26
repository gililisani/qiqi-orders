/**
 * L3 ENGINE — Loop A poller. Cursor-driven, idempotent, mode-aware.
 *
 * Every run: fetch orders updated since (cursor − overlap), gate each,
 * build its plan, persist state + events. NS writes only happen in
 * 'sandbox'/'live' modes via the pipeline (not yet wired — Phase 2b);
 * 'shadow' computes and records everything but writes nothing to NS.
 *
 * Idempotency: re-seeing an order is normal (updated_at moves on any
 * change, and we deliberately re-poll an overlap window). State rows are
 * upserts; the pipeline's ensure-steps make NS writes re-runnable.
 */
import { gateOrder } from '../core/validate';
import { buildOrderPlan } from '../core/orderTransform';
import type { OrderPlan, ShopifyOrder } from '../core/types';
import type { ShopifySyncStore } from '../store';
import { PipelineError } from './pipeline';
import type { ExecutionOutcome } from './execute';

/** Re-poll window: absorbs clock skew + updates landing mid-poll. */
const OVERLAP_MS = 30 * 60_000;

export interface PollDeps {
  store: ShopifySyncStore;
  fetchOrdersUpdatedSince: (isoTimestamp: string) => Promise<ShopifyOrder[]>;
  loadKnownSkus: () => Promise<Set<string>>;
  /**
   * NS writer for sandbox/live modes (wired to executeOrder + the mode's
   * NetSuite target). Absent in shadow mode — the poller then only plans.
   */
  execute?: (order: ShopifyOrder, plan: OrderPlan) => Promise<ExecutionOutcome>;
  /** Which NS the executor writes to; recorded on each order row. */
  nsTarget?: 'sandbox' | 'production';
  /**
   * Cutover guard (production target only): true = NetScore booked this
   * order — skip it instead of re-booking its chain. Wired to the
   * netscore_transaction_stamps snapshot.
   */
  isNetscoreEra?: (shopifyOrderId: string) => Promise<boolean>;
  now?: () => Date;
}

export interface PollResult {
  mode: string;
  fetched: number;
  proceeded: number;
  executed: number;
  skipped: number;
  errored: number;
  cursor: string | null;
}

export async function pollOrders(deps: PollDeps): Promise<PollResult> {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());
  const config = await store.getConfig();

  if (config.mode === 'off') {
    return { mode: 'off', fetched: 0, proceeded: 0, executed: 0, skipped: 0, errored: 0, cursor: config.orders_cursor };
  }
  const writeMode = config.mode === 'sandbox' || config.mode === 'live';
  if (writeMode && !deps.execute) {
    throw new Error(`mode is '${config.mode}' but the poller has no executor wired`);
  }

  // First run: start from now minus one day so we don't inhale all history
  // by accident. Backfills are explicit (scripts), never implicit.
  const cursorMs = config.orders_cursor
    ? new Date(config.orders_cursor).getTime() - OVERLAP_MS
    : now().getTime() - 24 * 3600_000;
  const since = new Date(cursorMs).toISOString();

  const orders = await deps.fetchOrdersUpdatedSince(since);
  const knownSkus = orders.length > 0 ? await deps.loadKnownSkus() : new Set<string>();

  let proceeded = 0;
  let executed = 0;
  let skipped = 0;
  let errored = 0;
  let maxUpdatedAt = config.orders_cursor;
  let processedCount = 0;
  let partial = false;
  // Orders arrive sorted by UPDATED_AT ascending (query sortKey), so the
  // cursor may only advance to orders that finished processing — and it
  // is checkpointed incrementally so a killed run resumes instead of
  // re-running the whole batch (the 2026-08-26 wedge: every poll died
  // mid-batch, nothing ever committed, the batch only grew).
  const startedMs = now().getTime();
  const BUDGET_MS = 240_000; // leave headroom under the 300s function cap

  for (const order of orders) {
    if (now().getTime() - startedMs > BUDGET_MS) {
      partial = true;
      break;
    }
    const orderId = order.id.replace(/^.*\//, '');
    const updatedAt = (order as any).updatedAt as string | undefined;

    try {
      const gate = gateOrder(order, knownSkus);

      if (gate.outcome === 'skip') {
        await store.seenOrder(order, null);
        await store.markSkipped(orderId, gate.reason, gate.message);
        await store.event('orders', 'gate_skip', orderId, { reason: gate.reason });
        skipped += 1;
        continue;
      }

      if (gate.outcome === 'error') {
        await store.seenOrder(order, null);
        await store.markError(orderId, gate.issues);
        await store.event('orders', 'gate_error', orderId, { issues: gate.issues });
        errored += 1;
        continue;
      }

      const plan = buildOrderPlan(order);
      await store.seenOrder(order, plan);
      await store.event('orders', 'planned', orderId, {
        totalCents: plan.totals.totalCents,
        payments: plan.payments.length,
        buyer: plan.buyer.kind,
      });
      proceeded += 1;

      if (writeMode && deps.execute) {
        if (deps.nsTarget === 'production' && deps.isNetscoreEra && (await deps.isNetscoreEra(orderId))) {
          await store.markSkipped(
            orderId,
            'NETSCORE_ERA',
            `${order.name} was booked by NetScore — updates to it are not auto-booked; handle any late fulfillment/refund manually in NS`,
          );
          await store.event('orders', 'netscore_era_skip', orderId, {});
          skipped += 1;
          continue;
        }
        try {
          const outcome = await deps.execute(order, plan);
          await store.setState(orderId, outcome.state, {
            ...outcome.nsIds,
            ns_target: deps.nsTarget ?? null,
            error_code: null,
            error_message: null,
            skip_reason: null,
          });
          await store.event('orders', 'executed', orderId, {
            state: outcome.state,
            so: outcome.nsIds.ns_so_id,
            invoice: outcome.nsIds.ns_invoice_id,
          });
          executed += 1;
        } catch (err: any) {
          errored += 1;
          if (err instanceof PipelineError) {
            await store.markError(orderId, [err.issue]);
            await store.event('orders', 'pipeline_error', orderId, { issue: err.issue });
          } else {
            await store.markError(orderId, [
              { code: 'UNSUPPORTED_SOURCE', message: String(err?.message ?? err).slice(0, 500) },
            ]);
            await store.event('orders', 'pipeline_exception', orderId, {
              error: String(err?.message ?? err).slice(0, 500),
            });
          }
        }
      } else {
        // Shadow mode: plan persisted, nothing written to NS.
        const existing = await store.getOrderState(orderId);
        if (existing?.state === 'error' || existing?.state === 'skipped') {
          await store.setState(orderId, 'pending', { error_code: null, error_message: null, skip_reason: null });
        }
      }
    } catch (err: any) {
      errored += 1;
      await store.event('orders', 'poll_exception', orderId, { error: String(err?.message ?? err).slice(0, 500) });
    } finally {
      // Runs on every outcome incl. the skip/error `continue` paths: the
      // order is done, the cursor may pass it, and every few orders the
      // progress is checkpointed so a killed run resumes mid-batch.
      if (updatedAt && (!maxUpdatedAt || updatedAt > maxUpdatedAt)) maxUpdatedAt = updatedAt;
      processedCount += 1;
      if (processedCount % 5 === 0) {
        await store.updateConfig({ orders_cursor: maxUpdatedAt, last_poll_at: now().toISOString(), last_poll_error: null });
      }
    }
  }

  await store.updateConfig({
    orders_cursor: maxUpdatedAt,
    last_poll_at: now().toISOString(),
    last_poll_error: null,
  });
  await store.event('system', 'poll_complete', null, {
    fetched: orders.length,
    processed: processedCount,
    proceeded,
    skipped,
    errored,
    partial,
    since,
  });

  return { mode: config.mode, fetched: orders.length, proceeded, executed, skipped, errored, cursor: maxUpdatedAt };
}
