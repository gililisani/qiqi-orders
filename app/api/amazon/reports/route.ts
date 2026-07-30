import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../platform/auth/guards';
import { createReport, isAmazonSpConfigured, REPORT_TYPES } from '../../../../lib/amazonSp/client';

/**
 * POST { type: 'returns' | 'reimbursements', from, to } — request an FBA
 * report from Amazon. Returns { reportId }; poll GET /api/amazon/reports/[id]
 * until it's DONE (typically 30s–2min).
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    if (!isAmazonSpConfigured()) {
      return NextResponse.json({ error: 'Amazon SP-API is not configured.' }, { status: 400 });
    }
    const { type, from, to } = await request.json();
    const reportType =
      type === 'returns' ? REPORT_TYPES.fbaReturns :
      type === 'reimbursements' ? REPORT_TYPES.fbaReimbursements :
      null;
    if (!reportType) {
      return NextResponse.json({ error: 'Unknown report type.' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
      return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 });
    }
    const reportId = await createReport(reportType, `${from}T00:00:00Z`, `${to}T23:59:59Z`);
    return NextResponse.json({ success: true, reportId });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Amazon report request error:', error);
    return NextResponse.json({ error: error.message || 'Failed to request report.' }, { status: 500 });
  }
}
