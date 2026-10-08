import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireWithPermission } from '../../../../platform/auth/guards';
import { clientCompanyId, listExternalSales } from '../../../../lib/salesLedger/clientView';

/**
 * GET /api/client/external-sales — the caller's own company's invoices
 * billed externally (approved by an admin on the NetSuite review page), for
 * the order list. Never takes a company parameter.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireWithPermission(request, 'orders', 'orders:view');
    const supabase = createServiceRoleClient();
    const companyId = await clientCompanyId(supabase, user.id);
    if (!companyId) return NextResponse.json({ error: 'No company associated with this account.' }, { status: 403 });
    return NextResponse.json({ sales: await listExternalSales(supabase, companyId) });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err?.message || 'Failed to load.' }, { status: 500 });
  }
}
