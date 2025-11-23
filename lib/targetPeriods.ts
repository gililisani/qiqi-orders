import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Calculate current progress for a target period by summing all Done orders
 * that were marked Done within the period's date range
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
 * Recalculate and update current_progress for all target periods of a company
 * Call this when an order status changes to/from Done
 */
export async function recalculateCompanyTargetPeriods(
  supabase: SupabaseClient,
  companyId: string
): Promise<void> {
  try {
    // Get all target periods for this company
    const { data: targetPeriods, error: periodsError } = await supabase
      .from('target_periods')
      .select('id, start_date, end_date')
      .eq('company_id', companyId);

    if (periodsError) {
      console.error('Error fetching target periods:', periodsError);
      return;
    }

    if (!targetPeriods || targetPeriods.length === 0) {
      return;
    }

    // Recalculate progress for each period
    const updates = await Promise.all(
      targetPeriods.map(async (period) => {
        const progress = await calculateTargetPeriodProgress(
          supabase,
          companyId,
          period.start_date,
          period.end_date
        );

        return {
          id: period.id,
          current_progress: progress,
        };
      })
    );

    // Batch update all periods
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('target_periods')
        .update({ current_progress: update.current_progress })
        .eq('id', update.id);

      if (updateError) {
        console.error(`Error updating target period ${update.id}:`, updateError);
      }
    }
  } catch (error) {
    console.error('Error recalculating company target periods:', error);
  }
}

