// Superseded by /api/netsuite/push-so
import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({ error: 'Use /api/netsuite/push-so instead.' }, { status: 410 });
}
