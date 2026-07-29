import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../../platform/auth/guards';

/**
 * GET — import history: every month ever pushed (or attempted), newest first,
 * with the admin who pushed it. Shown on page load so any admin can see at a
 * glance what has already been imported before uploading anything.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabaseAdmin = createServiceRoleClient();

    const { data: batches, error } = await supabaseAdmin
      .from('amazon_fba_batches')
      .select('period, status, ns_refs, error, created_by, created_at, updated_at')
      .order('period', { ascending: false });
    if (error) {
      if (error.message?.includes('does not exist')) {
        return NextResponse.json({ success: true, batches: [] });
      }
      throw new Error(error.message);
    }

    const adminIds = [...new Set((batches || []).map((b: any) => b.created_by).filter(Boolean))];
    let adminNames = new Map<string, string>();
    if (adminIds.length > 0) {
      const { data: admins } = await supabaseAdmin
        .from('admins')
        .select('id, name, email')
        .in('id', adminIds);
      adminNames = new Map((admins || []).map((a: any) => [a.id, a.name || a.email]));
    }

    return NextResponse.json({
      success: true,
      batches: (batches || []).map((b: any) => ({
        ...b,
        pushed_by: adminNames.get(b.created_by) || null,
      })),
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: error.message || 'Failed to load history.' }, { status: 500 });
  }
}
