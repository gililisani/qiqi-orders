// Legacy scaffold — product sync from NS is not yet implemented in v2
import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({ error: 'Product sync from NetSuite not implemented.' }, { status: 501 });
}
export async function GET() {
  return NextResponse.json({ connected: false, error: 'Use /api/netsuite/test-connection instead.' });
}
