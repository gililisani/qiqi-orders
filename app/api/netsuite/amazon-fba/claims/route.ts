import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { isAmazonSpConfigured } from '../../../../../lib/amazonSp/client';
import { buildClaimsSnapshot } from '../../../../../lib/amazonFba/claimableLosses';

// Route-level export (vercel.json maxDuration is not honored for Next
// routes): the refresh generates two Amazon reports, minutes not seconds.
export const maxDuration = 300;

/**
 * Claimable-losses snapshot for the Amazon FBA page panel.
 * GET — the stored weekly snapshot (instant).
 * POST — recompute live from Amazon now and store (refresh button).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'amazon:view');
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('amazon_fba_config')
      .select('claims_snapshot')
      .eq('id', 1)
      .maybeSingle();
    return NextResponse.json({ snapshot: data?.claims_snapshot ?? null });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err?.message || 'Failed to load snapshot.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'amazon:view');
    if (!isAmazonSpConfigured()) {
      return NextResponse.json({ error: 'Amazon SP-API is not configured.' }, { status: 400 });
    }
    const snapshot = await buildClaimsSnapshot();
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from('amazon_fba_config')
      .update({ claims_snapshot: snapshot })
      .eq('id', 1);
    if (error) throw error;
    return NextResponse.json({ snapshot });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err?.message || 'Refresh failed.' }, { status: 500 });
  }
}
