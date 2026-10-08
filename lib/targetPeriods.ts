import { SupabaseClient } from '@supabase/supabase-js';
import {
  buildSfUsedByOrder,
  computePeriodMetrics,
  fetchRevenueInputs,
} from './companyPerformance';

/**
 * Recalculate and update current_progress for all target periods of a
 * company. Call this when an order status changes to/from Done.
 *
 * Batched: a fixed number of queries regardless of period count, via
 * lib/companyPerformance. THROWS on any fetch/update error instead of
 * writing zeros — a transient query failure must never persist wrong
 * progress. The sole caller (the target-periods/recalculate route)
 * catches and reports.
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
  const sfUsedByOrder = buildSfUsedByOrder(inputs.sfItems);
  const now = new Date();

  for (const period of targetPeriods) {
    const metrics = computePeriodMetrics(
      now,
      period,
      inputs.doneOrders,
      inputs.firstDone,
      sfUsedByOrder,
      inputs.historical
    );

    const { error: updateError } = await supabase
      .from('target_periods')
      .update({ current_progress: metrics.actual })
      .eq('id', period.id);
    if (updateError) {
      throw new Error(`update period ${period.id}: ${updateError.message}`);
    }
  }
}
