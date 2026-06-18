import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Fetch order with all NS-relevant fields. We pull the company's CURRENT
    // location (companies.location_id → Locations) which is what we actually
    // push, plus the order's frozen snapshot (orders.location_id) as a
    // legacy fallback for companies that have no location set.
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        po_number,
        created_at,
        status,
        support_fund_used,
        netsuite_so_id,
        location_id,
        snapshot_location:Locations!orders_location_id_fkey(
          location_name,
          netsuite_id,
          subsidiary:subsidiaries(netsuite_id)
        ),
        company:companies(
          company_name,
          netsuite_number,
          netsuite_internal_id,
          location_id,
          subsidiary:subsidiaries(name, netsuite_id),
          location:Locations(
            location_name,
            netsuite_id,
            subsidiary:subsidiaries(netsuite_id)
          ),
          class:classes(name)
        ),
        order_items(
          quantity,
          unit_price,
          total_price,
          is_support_fund_item,
          product:Products(sku, item_name, netsuite_name)
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.netsuite_so_id) {
      return NextResponse.json(
        { error: 'This order already has a NetSuite SO (ID: ' + order.netsuite_so_id + ').' },
        { status: 409 }
      );
    }

    // Re-resolve the fulfilling location from the company's CURRENT location
    // at push time. A (re)push recreates the SO *now*, so it must reflect the
    // client's current config — NOT orders.location_id, which is frozen at
    // creation. The freeze protects already-pushed historical orders from
    // later 3PL re-pointing, but it also caused the CSF bug: unlink → delete
    // NS SO → re-push re-used the stale snapshot (Packable-INC) and cross-sub
    // never fired. We push the company's current location; fall back to the
    // frozen snapshot only when the company has no location set (legacy).
    const orderForNs: any = { ...order };
    const companyLocation = orderForNs.company?.location ?? null;
    const resolvedLocation = companyLocation ?? orderForNs.snapshot_location ?? null;
    if (orderForNs.company) {
      orderForNs.company = {
        ...orderForNs.company,
        location: resolvedLocation,
      };
    }
    // The location_id we stamp back onto the order so it reflects what was
    // actually pushed: the company's current location, falling back to the
    // existing snapshot if the company has none.
    const resolvedLocationId =
      (order as any).company?.location_id ?? order.location_id ?? null;

    const ns = createNetSuiteAPI();
    const { nsSOId, soNumber } = await ns.pushOrderToNetSuite(orderForNs);

    // Write SO ID + number back, advance status to "In Process", and snapshot
    // the location actually pushed so the order record stays in sync.
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        netsuite_so_id: nsSOId,
        so_number: soNumber,
        status: 'In Process',
        location_id: resolvedLocationId,
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('Failed to store NS SO ID in Hub:', updateError);
      // Return success anyway — the SO was created, user can note the number manually
    }

    // Log to order history
    await supabase.from('order_history').insert([{
      action_type: 'status_change',
      order_id: orderId,
      status_from: order.status,
      status_to: 'In Process',
      notes: `NetSuite Sales Order created: ${soNumber}`,
      changed_by_name: 'System',
      changed_by_role: 'admin',
    }]);

    return NextResponse.json({ success: true, nsSOId, soNumber });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('push-so error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create NetSuite SO' }, { status: 500 });
  }
}
