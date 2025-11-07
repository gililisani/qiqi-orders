import { NextRequest, NextResponse } from 'next/server';
import { fetchStandaloneSLIData } from '../../../../../lib/pdf/api/sliDataFetcher';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sliId = params.id;
    const data = await fetchStandaloneSLIData(sliId);
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching SLI data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
