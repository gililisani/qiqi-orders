import type { SupabaseClient } from '@supabase/supabase-js';
import { computePeriodMetrics, fetchRevenueInputs } from './companyPerformance';

/**
 * Recalculate `target_periods.current_progress` for one company from the
 * sales ledger (what NetSuite billed in each period — the same math as the
 * Company Performance report, see lib/companyPerformance.ts).
 *
 * Runs after every sales-ledger sync (nightly + "Sync now") and from the
 * older triggers (order status → Done), which are now harmless no-ops for
 * the number: a Hub order counts when NetSuite bills it, not when it's Done.
 *
 * Throws on any query or write error. Callers fire this as a best-effort
 * follow-up, so they wrap it, but they must never get partial progress
 * written silently.
 */
export async function recalculateCompanyTargetPeriods(
  supabase: SupabaseClient,
  companyId: string
): Promise<void> {
  const { data: targetPeriods, error: periodsError } = await supabase
    .from('target_periods')
    .select('id, start_date, end_date, target_amount')
    .eq('company_id', companyId);
  if (periodsError) throw new Error(`periods: ${periodsError.message}`);
  if (!targetPeriods || targetPeriods.length === 0) return;

  const inputs = await fetchRevenueInputs(supabase, [companyId]);
  const now = new Date();

  for (const period of targetPeriods) {
    const metrics = computePeriodMetrics(now, period, inputs.sales);
    const { error: updateError } = await supabase
      .from('target_periods')
      .update({ current_progress: metrics.actual })
      .eq('id', period.id);
    if (updateError) {
      throw new Error(`update period ${period.id}: ${updateError.message}`);
    }
  }
}
