import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    // Check env vars are set before trying to connect
    const missing: string[] = [];
    if (!process.env.NETSUITE_ACCOUNT_ID) missing.push('NETSUITE_ACCOUNT_ID');
    if (!process.env.NETSUITE_CONSUMER_KEY) missing.push('NETSUITE_CONSUMER_KEY');
    if (!process.env.NETSUITE_CONSUMER_SECRET) missing.push('NETSUITE_CONSUMER_SECRET');
    if (!process.env.NETSUITE_TOKEN_ID) missing.push('NETSUITE_TOKEN_ID');
    if (!process.env.NETSUITE_TOKEN_SECRET) missing.push('NETSUITE_TOKEN_SECRET');
    if (missing.length > 0) {
      return NextResponse.json({
        connected: false,
        error: `Missing env vars: ${missing.join(', ')}`,
      });
    }

    const ns = createNetSuiteAPI();
    // Call SuiteQL directly so errors propagate with full detail
    await ns.suiteQL('SELECT id FROM subsidiary');
    return NextResponse.json({ connected: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('NetSuite test-connection error:', error);
    return NextResponse.json({
      connected: false,
      error: error?.message || String(error) || 'Unknown error',
    });
  }
}
