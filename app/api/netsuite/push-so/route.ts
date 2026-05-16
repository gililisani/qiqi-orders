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

    // Fetch order with all NS-relevant fields
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        po_number,
        created_at,
        status,
        support_fund_used,
        netsuite_so_id,
        company:companies(
          company_name,
          netsuite_number,
          netsuite_internal_id,
          subsidiary:subsidiaries(name, netsuite_id),
          location:Locations(location_name, netsuite_id),
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

    const ns = createNetSuiteAPI();
    const { nsSOId, soNumber } = await ns.pushOrderToNetSuite(order as any);

    // Write SO ID + number back, and advance status to "In Process"
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        netsuite_so_id: nsSOId,
        so_number: soNumber,
        status: 'In Process',
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('Failed to store NS SO ID in Hub:', updateError);
      // Return success anyway — the SO was created, user can note the number manually
    }

    // Log to order history
    await supabase.from('order_history').insert([{
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
