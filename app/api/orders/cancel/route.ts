import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';
import { callRouteHandler } from '../../../../lib/internalRoute';
import { POST as shipHeroCancelHandler } from '../../fulfillment/shiphero/cancel/route';

/**
 * POST /api/orders/cancel  { orderId }
 *
 * "Cancel Order" — admin-only, and only for an ACCEPTED order (In Process
 * with a NetSuite SO, not yet invoiced). Unwinds the acceptance:
 *   1. cancels fulfillment in ShipHero (first — stop the warehouse from
 *      packing; skipped when the order never reached the warehouse)
 *   2. deletes the NetSuite Sales Order (idempotent — 404 counts as deleted)
 *   3. clears the SO link and moves the order to Cancelled
 *
 * If step 1 succeeds and step 2 fails, retrying is safe: the fulfillment
 * status is already 'cancelled' so the warehouse step is skipped.
 *
 * Pre-acceptance orders don't need this route (nothing external exists yet —
 * the admin cancels via the status dropdown), and invoiced orders are
 * refused (void the invoice / use the delete flow instead).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminWithPermission(request, 'netsuite');

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        'id, status, netsuite_so_id, so_number, netsuite_invoice_id, external_fulfillment_id, fulfillment_status',
      )
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (!order.netsuite_so_id) {
      return NextResponse.json(
        { error: 'Only accepted orders can be cancelled here — use the status dropdown for orders that were never accepted.' },
        { status: 400 },
      );
    }
    if (order.netsuite_invoice_id) {
      return NextResponse.json(
        { error: 'This order is already invoiced — cancellation is blocked. Handle the invoice in NetSuite first.' },
        { status: 409 },
      );
    }
    if (order.status !== 'In Process') {
      return NextResponse.json(
        { error: `Orders in status "${order.status}" cannot be cancelled this way.` },
        { status: 409 },
      );
    }

    // ---- Step 1: stop the warehouse ----
    let warehouse: 'cancelled' | 'dry-run' | 'skipped' = 'skipped';
    if (order.external_fulfillment_id && order.fulfillment_status !== 'cancelled') {
      const wh = await callRouteHandler(shipHeroCancelHandler, request, {
        orderId,
        reason: 'Order cancelled in Qiqi Hub',
      });
      if (!wh.ok) {
        return NextResponse.json(
          {
            error: `Could not cancel the order at the warehouse: ${wh.data.error || wh.status}. The order was NOT cancelled — try again.`,
            step: 'warehouse',
          },
          { status: 502 },
        );
      }
      warehouse = wh.data.dryRun ? 'dry-run' : 'cancelled';
    }

    // ---- Step 2: delete the NetSuite Sales Order ----
    const soNumber = order.so_number;
    try {
      const ns = createNetSuiteAPI();
      await ns.deleteSalesOrder(order.netsuite_so_id);
    } catch (err: any) {
      return NextResponse.json(
        {
          error: `Warehouse fulfillment is cancelled, but deleting NetSuite SO ${soNumber} failed: ${err.message}. Run Cancel Order again to retry.`,
          step: 'netsuite',
        },
        { status: 502 },
      );
    }

    // ---- Step 3: Hub state ----
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'Cancelled',
        netsuite_so_id: null,
        so_number: null,
      })
      .eq('id', orderId);
    if (updateError) {
      console.error('cancel order: failed to update hub order:', updateError);
      return NextResponse.json(
        { error: 'NetSuite and warehouse are cancelled, but saving the Hub status failed — refresh and retry.' },
        { status: 500 },
      );
    }

    const { data: adminProfile } = await supabase
      .from('admins')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();

    await supabase.from('order_history').insert([
      {
        action_type: 'order_updated',
        order_id: orderId,
        status_from: order.status,
        status_to: order.status,
        notes: `NetSuite Sales Order ${soNumber ?? order.netsuite_so_id} deleted (order cancelled).`,
        changed_by_name: 'System',
        changed_by_role: 'admin',
      },
      {
        action_type: 'status_change',
        order_id: orderId,
        status_from: order.status,
        status_to: 'Cancelled',
        notes: 'Order cancelled',
        changed_by_id: user.id,
        changed_by_name: adminProfile?.name || 'Qiqi',
        changed_by_role: 'admin',
        visible_to_client: true,
      },
    ]);

    return NextResponse.json({ success: true, warehouse });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('cancel order error:', error);
    return NextResponse.json({ error: error.message || 'Failed to cancel order' }, { status: 500 });
  }
}
