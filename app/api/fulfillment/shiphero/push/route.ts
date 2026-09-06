import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { pushOrderToWarehouse } from '../../../../../lib/fulfillment/pushOrder';

/**
 * POST /api/fulfillment/shiphero/push  { orderId }
 *
 * Admin-triggered push of a Hub order to ShipHero. The core (validations,
 * idempotency, dry-run gate, hold-clearing) lives in lib/fulfillment/
 * pushOrder.ts, shared with the payment-hold auto-release. Pushing a held
 * order is a deliberate override — the UI confirms first, and the push
 * clears the hold.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'orders:edit');

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const outcome = await pushOrderToWarehouse(supabase, orderId, { trigger: 'manual' });

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.message }, { status: outcome.httpStatus });
    }
    if (outcome.dryRun) {
      return NextResponse.json({ success: true, dryRun: true, request: outcome.request });
    }
    return NextResponse.json({
      success: true,
      externalId: outcome.externalId,
      ...(outcome.warning ? { warning: outcome.warning } : {}),
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('shiphero push error:', error);
    return NextResponse.json({ error: error.message || 'Failed to send order to ShipHero' }, { status: 500 });
  }
}
