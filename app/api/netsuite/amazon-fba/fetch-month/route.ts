import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { isAmazonSpConfigured } from '../../../../../lib/amazonSp/client';
import { prepareMonthFromAmazon } from '../../../../../lib/amazonFba/prepareMonth';

// Finances-API paging plus the async returns report (generation can take a
// few minutes on Amazon's side) — a returns timeout degrades gracefully to a
// money-only preview, but give the report a real chance to finish.
export const maxDuration = 300;

/**
 * POST { period: 'YYYY-MM' } — fetch a month straight from the Amazon
 * Finances API and store it as a prepared batch (same preview shape as a CSV
 * upload, but with exact SKUs and quantities). The month card UI + push
 * route work on it unchanged.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    if (!isAmazonSpConfigured()) {
      return NextResponse.json({ error: 'Amazon SP-API is not configured.' }, { status: 400 });
    }
    const { period } = await request.json();
    if (!/^\d{4}-\d{2}$/.test(period || '')) {
      return NextResponse.json({ error: 'Invalid period — expected YYYY-MM.' }, { status: 400 });
    }
    const supabaseAdmin = createServiceRoleClient();
    const result = await prepareMonthFromAmazon(period, supabaseAdmin);
    if (result.status === 'already-pushed') {
      return NextResponse.json({ error: `${period} was already pushed to NetSuite.` }, { status: 409 });
    }
    return NextResponse.json({ success: true, preview: result.preview });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Amazon fetch-month error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch month from Amazon.' }, { status: 500 });
  }
}
