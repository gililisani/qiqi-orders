import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';

/** GET (ap:view): learned vendor profiles, most bills first. */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'ap:view');
    const { data, error } = await createServiceRoleClient()
      .from('ap_vendor_profiles')
      .select('*')
      .order('bill_count', { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return NextResponse.json({ vendors: data ?? [] });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[ap/vendors] GET', err);
    return NextResponse.json({ error: err?.message || 'Failed to load vendors.' }, { status: 500 });
  }
}
