import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';

/**
 * POST /api/netsuite/recover-so   Body: { orderId }
 *
 * Recovery for a push that created the SO in NetSuite but didn't finish writing
 * it back to the Hub (e.g. the function timed out). Looks up the SO by its
 * externalId (= order.id) and links it. This is fast (one SuiteQL) and can NEVER
 * create a duplicate — it only ever links an existing SO. The frontend calls it
 * automatically when a push errors, so a slow push self-heals instead of leaving
 * the order looking unpushed (which is what tempts a duplicate re-push).
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, netsuite_so_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.netsuite_so_id) {
      return NextResponse.json({ recovered: false, alreadyLinked: true });
    }

    const ns = createNetSuiteAPI();
    const existing = await ns.findSalesOrderByExternalId(orderId);
    if (!existing) {
      return NextResponse.json({ recovered: false });
    }

    await supabase
      .from('orders')
      .update({
        netsuite_so_id: existing.nsSOId,
        so_number: existing.soNumber,
        status: 'In Process',
      })
      .eq('id', orderId);

    await supabase.from('order_history').insert([{
      action_type: 'status_change',
      order_id: orderId,
      status_from: order.status,
      status_to: 'In Process',
      notes: `NetSuite Sales Order ${existing.soNumber} linked (recovered after an interrupted push).`,
      changed_by_name: 'System',
      changed_by_role: 'admin',
    }]);

    return NextResponse.json({
      recovered: true,
      nsSOId: existing.nsSOId,
      soNumber: existing.soNumber,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('recover-so error:', error);
    return NextResponse.json({ error: error.message || 'Recovery failed' }, { status: 500 });
  }
}
