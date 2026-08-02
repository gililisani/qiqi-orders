import { SupabaseClient } from '@supabase/supabase-js';
import {
  buildSfUsedByOrder,
  computePeriodMetrics,
  fetchRevenueInputs,
} from './companyPerformance';

/**
 * Calculate current progress for a target period by summing all Done orders
 * that were marked Done within the period's date range.
 *
 * BROWSER-LEGACY: only the admin company page and the client company page
 * still call this (per-period, RLS-scoped client, swallows errors to keep
 * those pages rendering). Server-side code must NOT use it — use the
 * batched, strict builders in lib/companyPerformance instead.
 */
export async function calculateTargetPeriodProgress(
  supabase: SupabaseClient,
  companyId: string,
  periodStartDate: string,
  periodEndDate: string
): Promise<number> {
  try {
    // Get all orders for this company that are currently Done
    const { data: doneOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id, total_value')
      .eq('company_id', companyId)
      .eq('status', 'Done');

    let orderProgress = 0;

    if (ordersError) {
      console.error('Error fetching done orders:', ordersError);
      // Continue to historical sales even if orders query fails
    } else if (doneOrders && doneOrders.length > 0) {
      // Get order IDs
      const orderIds = doneOrders.map(order => order.id);

      // Find when each order was marked Done from order_history
      // We need to get the earliest Done date for each order
      // Query all Done entries, then group by order_id to get earliest
      const { data: doneHistoryEntries, error: historyError } = await supabase
        .from('order_history')
        .select('order_id, created_at')
        .in('order_id', orderIds)
        .eq('status_to', 'Done')
        .order('created_at', { ascending: true });

      if (historyError) {
        console.error('Error fetching order history:', historyError);
        // Continue to historical sales even if history query fails
      } else {
        // Create a map of order_id -> done_date (earliest Done date)
        // Only store the first (earliest) Done date for each order
        const orderDoneDates = new Map<string, Date>();
        if (doneHistoryEntries) {
          for (const entry of doneHistoryEntries) {
            if (!orderDoneDates.has(entry.order_id)) {
              orderDoneDates.set(entry.order_id, new Date(entry.created_at));
            }
          }
        }

        // Filter orders that were marked Done within the target period date range
        const periodStart = new Date(periodStartDate);
        const periodEnd = new Date(periodEndDate);
        // Set end date to end of day
        periodEnd.setHours(23, 59, 59, 999);

        for (const order of doneOrders) {
          const doneDate = orderDoneDates.get(order.id);
          if (doneDate && doneDate >= periodStart && doneDate <= periodEnd) {
            orderProgress += order.total_value || 0;
          }
        }
      }
    }

    // Get historical sales for this company within the target period date range
    const { data: historicalSales, error: historicalError } = await supabase
      .from('historical_sales')
      .select('amount, sale_date')
      .eq('company_id', companyId)
      .gte('sale_date', periodStartDate)
      .lte('sale_date', periodEndDate);

    if (historicalError) {
      console.error('Error fetching historical sales:', historicalError);
      // Return order progress even if historical sales query fails
      return orderProgress;
    }

    // Sum historical sales amounts
    const historicalProgress = (historicalSales || []).reduce((sum, sale) => {
      return sum + (parseFloat(sale.amount.toString()) || 0);
    }, 0);

    // Return combined progress: orders + historical sales
    return orderProgress + historicalProgress;
  } catch (error) {
    console.error('Error calculating target period progress:', error);
    return 0;
  }
}

/**
 * Recalculate and update current_progress for all target periods of a
 * company. Call this when an order status changes to/from Done.
 *
 * Batched: a fixed number of queries regardless of period count, via
 * lib/companyPerformance. THROWS on any fetch/update error instead of
 * writing zeros — a transient query failure must never persist wrong
 * progress. Both callers (orders/complete, target-periods/recalculate)
 * already guard with try/catch.
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
