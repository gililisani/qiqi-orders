/**
 * Loop E runner: fetch recent PAID payouts, book each (fee bill + payment
 * + net journal), persist per-payout state for the dashboard. Shared by
 * the daily cron (app/api/cron/shopify-payouts) and the manual script
 * (scripts/shopify/backfill-payouts.ts). Idempotent end to end — SHOPPO-*
 * externalids adopt on re-run, so overlapping runs are safe.
 */
import { fetchRecentPayouts } from '../payoutFetch';
import { ensurePayoutBooking } from './payouts';
import { PipelineError } from './pipeline';
import type { NsApi } from './pipeline';
import type { EngineConfig } from './config';
import type { ShopifySyncStore } from '../store';
import type { NsTarget } from './nsTarget';

export interface PayoutRunResult {
  booked: Array<{ payoutId: string; issuedAt: string; netCents: number; created: boolean }>;
  errored: Array<{ payoutId: string; error: string }>;
}

export async function bookRecentPayouts(opts: {
  count: number;
  ns: NsApi;
  config: EngineConfig;
  store: ShopifySyncStore | null;
  nsTarget: NsTarget;
  log?: (line: string) => void;
}): Promise<PayoutRunResult> {
  const log = opts.log ?? (() => {});
  const payouts = await fetchRecentPayouts({ count: opts.count });
  const result: PayoutRunResult = { booked: [], errored: [] };
  for (const { payout, txns } of payouts) {
    try {
      const r = await ensurePayoutBooking(payout, txns, opts.ns, opts.config);
      const c = r.created;
      log(
        `✓ payout ${r.plan.shopifyPayoutId} (${r.plan.issuedAt.slice(0, 10)}) net=$${(r.plan.netCents / 100).toFixed(2)} ` +
          `fees=$${(r.plan.totalFeeCents / 100).toFixed(2)} → bill=${r.nsFeeBillId ?? '-'}${c.bill ? '(new)' : ''} ` +
          `pay=${r.nsFeePaymentId ?? '-'}${c.payment ? '(new)' : ''} journal=${r.nsJournalId}${c.journal ? '(new)' : ''}`,
      );
      await opts.store?.upsertPayout({
        shopify_payout_id: r.plan.shopifyPayoutId,
        issued_at: r.plan.issuedAt.slice(0, 10),
        status: r.plan.status,
        net_cents: r.plan.netCents,
        fee_cents: r.plan.totalFeeCents,
        state: 'booked',
        ns_target: opts.nsTarget,
        ns_fee_bill_id: r.nsFeeBillId,
        ns_fee_payment_id: r.nsFeePaymentId,
        ns_journal_id: r.nsJournalId,
        composition: { breakdown: r.plan.breakdown, disputes: r.plan.disputes } as any,
        error_message: null,
      });
      result.booked.push({
        payoutId: r.plan.shopifyPayoutId,
        issuedAt: r.plan.issuedAt.slice(0, 10),
        netCents: r.plan.netCents,
        created: c.journal,
      });
    } catch (err: any) {
      const msg = err instanceof PipelineError ? `${err.issue.code}: ${err.issue.message}` : String(err?.message ?? err);
      log(`✗ payout ${payout.legacyResourceId}: ${msg.slice(0, 220)}`);
      await opts.store?.upsertPayout({
        shopify_payout_id: payout.legacyResourceId,
        issued_at: payout.issuedAt.slice(0, 10),
        status: payout.status,
        net_cents: Math.round(Number(payout.net.amount) * 100),
        fee_cents: 0,
        state: 'error',
        ns_target: opts.nsTarget,
        error_message: msg.slice(0, 500),
      });
      result.errored.push({ payoutId: payout.legacyResourceId, error: msg.slice(0, 500) });
    }
  }
  return result;
}
