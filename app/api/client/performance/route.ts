import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireWithPermission,
} from '../../../../platform/auth/guards';
import {
  buildCompanyPerformance,
  resolveWindowRange,
} from '../../../../lib/companyPerformance';

/**
 * GET /api/client/performance
 *   ?window=this-month|last-month|this-year|last-year|custom
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD   (custom only)
 *
 * Client-facing twin of /api/reports/company-performance/[companyId]:
 * same batched builder, same payload — but the company is ALWAYS the
 * caller's own (clients.company_id), never a request parameter. Gated on
 * the 'reports' permission, same as the "Your company" area.
 */

export async function GET(request: NextRequest) {
  try {
    const user = await requireWithPermission(request, 'reports', 'insights');

    const supabase = createServiceRoleClient();
    const { data: clientRow, error: clientErr } = await supabase
      .from('clients')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();
    if (clientErr) throw new Error(`client: ${clientErr.message}`);
    if (!clientRow?.company_id) {
      return NextResponse.json(
        { error: 'No company associated with this account.' },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const window = searchParams.get('window') ?? 'this-month';
    const { from, to } = resolveWindowRange(
      window,
      searchParams.get('from'),
      searchParams.get('to'),
    );

    const data = await buildCompanyPerformance(supabase, clientRow.company_id, from, to);
    return NextResponse.json({ success: true, windowKey: window, ...data });
  } catch (err: any) {
    if (err instanceof Response) return err;
    const msg = err?.message ?? 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
