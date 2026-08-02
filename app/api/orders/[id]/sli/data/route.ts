import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../../platform/auth/guards';
import { fetchOrderSLIData } from '../../../../../../lib/pdf/api/sliDataFetcher';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Admin-only: this returns full customs data (addresses, HS codes,
    // values) for ANY order, and its sole caller is the admin SLI preview.
    // Previously any authenticated user could read any order here (IDOR).
    await requireAdmin(request);

    const orderId = params.id;
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const data = await fetchOrderSLIData(orderId, token);

    return NextResponse.json(data);
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error fetching order SLI data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
