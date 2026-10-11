import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { runInventoryCheck } from '../../../../lib/inventoryCheck/run';
import { inventoryCheckUnavailable, liveInventoryCheckDeps } from '../../../../lib/inventoryCheck/live';

// Route-level export: vercel.json maxDuration is not honored for Next routes.
export const maxDuration = 120;

/**
 * Nightly (vercel.json): snapshot NetSuite vs ShipHero stock for every
 * ships-from location (lib/inventoryCheck). Read-only towards both systems.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const unavailable = inventoryCheckUnavailable();
  if (unavailable) {
    // Staging has no NetSuite / ShipHero on purpose — succeed quietly.
    return NextResponse.json({ success: true, skipped: unavailable });
  }
  try {
    const results = await runInventoryCheck(createServiceRoleClient(), liveInventoryCheckDeps(), { trigger: 'nightly' });
    console.log('[cron/inventory-check]', JSON.stringify(results));
    return NextResponse.json({ success: results.every((r) => !r.error), results });
  } catch (err: any) {
    console.error('[cron/inventory-check] error:', err);
    return NextResponse.json({ error: err?.message || 'Inventory check failed' }, { status: 500 });
  }
}
