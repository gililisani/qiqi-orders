import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../platform/auth/guards';
import {
  isAmazonSpConfigured,
  getOrderMetrics,
  getFbaInventory,
  getFinancialEvents,
  AMAZON_TZ_OFFSET,
} from '../../../../lib/amazonSp/client';
import { summarizeFinancialEvents } from '../../../../lib/amazonSp/overview';

export const maxDuration = 120; // finances can page over long windows

/** Today's date parts in Amazon's (Pacific) timezone. */
function amazonToday(): string {
  return new Date(Date.now() - 7 * 3600 * 1000).toISOString().split('T')[0];
}

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD — Amazon activity overview.
 * Defaults to the current month (Amazon/Pacific time). Returns sales metrics
 * (today + period), the finance summary (fees by type, refunds,
 * reimbursements), and current FBA inventory.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    if (!isAmazonSpConfigured()) {
      return NextResponse.json(
        { error: 'Amazon SP-API credentials are not configured (AMAZON_SP_* env vars).' },
        { status: 400 }
      );
    }

    const today = amazonToday();
    const defaultFrom = `${today.slice(0, 7)}-01`;
    const from = request.nextUrl.searchParams.get('from') || defaultFrom;
    const to = request.nextUrl.searchParams.get('to') || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 });
    }

    const [todayMetrics, periodMetrics, events, inventory] = await Promise.all([
      getOrderMetrics(
        `${today}T00:00:00${AMAZON_TZ_OFFSET}`,
        `${today}T23:59:59${AMAZON_TZ_OFFSET}`,
        'Total'
      ),
      getOrderMetrics(`${from}T00:00:00${AMAZON_TZ_OFFSET}`, `${to}T23:59:59${AMAZON_TZ_OFFSET}`, 'Total'),
      getFinancialEvents(`${from}T00:00:00Z`, `${to}T23:59:59Z`),
      getFbaInventory(),
    ]);

    const finance = summarizeFinancialEvents(events);

    return NextResponse.json({
      success: true,
      range: { from, to, today },
      today: todayMetrics[0] || null,
      period: periodMetrics[0] || null,
      finance,
      inventory: inventory
        .filter((i) => (i.totalQuantity || 0) > 0 || (i.inventoryDetails?.inboundShippedQuantity || 0) > 0)
        .sort((a, b) => (b.totalQuantity || 0) - (a.totalQuantity || 0)),
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Amazon dashboard error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load Amazon data.' }, { status: 500 });
  }
}
