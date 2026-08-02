import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';

/**
 * POST { period, rows, all_green } — record a CSV verification result on a
 * pushed batch (the audit trail for the accounting team). Fired automatically
 * when the month card renders a CSV-vs-NetSuite comparison. Latest wins.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminWithPermission(request, 'netsuite');
    const { period, rows, all_green } = await request.json();
    if (!/^\d{4}-\d{2}$/.test(period || '') || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'Invalid audit payload.' }, { status: 400 });
    }

    const supabaseAdmin = createServiceRoleClient();
    const { data: adminRow } = await supabaseAdmin
      .from('admins')
      .select('name, email')
      .eq('id', admin.id)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from('amazon_fba_batches')
      .update({
        audit: {
          verified_at: new Date().toISOString(),
          verified_by: admin.id,
          verified_by_name: adminRow?.name || adminRow?.email || 'admin',
          all_green: !!all_green,
          rows: rows.slice(0, 20),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('period', period)
      .eq('status', 'pushed');
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: error.message || 'Failed to record audit.' }, { status: 500 });
  }
}
