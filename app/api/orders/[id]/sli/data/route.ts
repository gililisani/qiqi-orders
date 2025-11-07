import { NextRequest, NextResponse } from 'next/server';
import { fetchOrderSLIData } from '../../../../../../lib/pdf/api/sliDataFetcher';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;
    
    // Get auth token
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const data = await fetchOrderSLIData(orderId, token);
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching order SLI data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
