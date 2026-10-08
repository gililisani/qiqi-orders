import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireWithPermission } from '../../../../../platform/auth/guards';
import { clientCompanyId, getExternalSale } from '../../../../../lib/salesLedger/clientView';

/**
 * GET /api/client/external-sales/[id] — one invoice billed externally, with
 * its products, support funds and credits. 404 unless it belongs to the
 * caller's own company and an admin approved it.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const user = await requireWithPermission(request, 'orders', 'orders:view');
    const supabase = createServiceRoleClient();
    const companyId = await clientCompanyId(supabase, user.id);
    if (!companyId) return NextResponse.json({ error: 'No company associated with this account.' }, { status: 403 });
    const sale = await getExternalSale(supabase, companyId, id);
    if (!sale) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return NextResponse.json({ sale });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err?.message || 'Failed to load.' }, { status: 500 });
  }
}
