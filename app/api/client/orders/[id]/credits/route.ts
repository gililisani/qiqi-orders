import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireWithPermission } from '../../../../../../platform/auth/guards';
import { clientCompanyId, creditsAttached } from '../../../../../../lib/salesLedger/clientView';

/**
 * GET /api/client/orders/[id]/credits — credits attached to one of the
 * caller's own company's Hub orders (damaged / short-shipped products), so
 * the order shows its value after credits. 404 for anyone else's order.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const user = await requireWithPermission(request, 'orders', 'orders:view');
    const supabase = createServiceRoleClient();
    const companyId = await clientCompanyId(supabase, user.id);
    if (!companyId) return NextResponse.json({ error: 'No company associated with this account.' }, { status: 403 });
    const { data: order, error } = await supabase.from('orders').select('company_id').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!order || order.company_id !== companyId) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return NextResponse.json({ credits: await creditsAttached(supabase, { orderId: id }), invoices: [] });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err?.message || 'Failed to load.' }, { status: 500 });
  }
}
