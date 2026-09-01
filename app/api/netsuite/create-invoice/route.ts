import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { createInvoiceForOrder } from '../../../../lib/orderInvoice';

/**
 * POST /api/netsuite/create-invoice  { orderId }
 *
 * Admin-triggered invoice creation. The core logic (detect-first, shipping
 * line, invoice columns + status 'Ready' + history) lives in
 * lib/orderInvoice.ts, shared with the fulfillment automation.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'orders:edit');

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const outcome = await createInvoiceForOrder(supabase, orderId);

    if (!outcome.ok) {
      const status =
        outcome.code === 'not_found'
          ? 404
          : outcome.code === 'no_so'
            ? 400
            : outcome.code === 'already_invoiced'
              ? 409
              : 410; // so_missing_in_ns
      return NextResponse.json({ error: outcome.message }, { status });
    }

    return NextResponse.json({ success: true, linked: outcome.linked, ...outcome.result });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('create-invoice error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create NetSuite invoice' }, { status: 500 });
  }
}
