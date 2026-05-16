import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const ns = createNetSuiteAPI();
    const connected = await ns.testConnection();
    return NextResponse.json({ connected });
  } catch (error: any) {
    if (error instanceof Response) return error;
    return NextResponse.json({ connected: false, error: error.message });
  }
}
