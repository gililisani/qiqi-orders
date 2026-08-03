import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAuthenticatedUser } from '../../../../../../platform/auth/guards';
import { assertOrderAccess } from '../../../../../../platform/auth/orderAccess';
import { fetchOrderSLIData } from '../../../../../../lib/pdf/api/sliDataFetcher';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Admin OR a client of the order's own company (owner decision
    // 2026-08-03: clients see their order's SLI document). Anything broader
    // re-opens the original IDOR — this returns full customs data
    // (addresses, HS codes, values) for the order.
    const orderId = params.id;
    const user = await requireAuthenticatedUser(request);
    const access = await assertOrderAccess(createServiceRoleClient(), user, orderId);
    if (!access.ok) return access.response;

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
