import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';

/**
 * Nightly (03:00 UTC, vercel.json): refresh the executive-report materialized
 * views. Replaces the pg_cron schedule the original migration hoped for —
 * pg_cron isn't enabled on this Supabase project, which left the MVs frozen
 * at their creation date (May 21) and the reports landing page showing zeros.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.rpc('refresh_executive_reports');
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('refresh-reports cron failed:', err);
    return NextResponse.json({ error: err.message || 'Refresh failed.' }, { status: 500 });
  }
}
