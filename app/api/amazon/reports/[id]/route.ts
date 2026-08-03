import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { getReportStatus, downloadReportRows } from '../../../../../lib/amazonSp/client';
import {
  parseReturnsReportRows,
  parseReimbursementsReportRows,
} from '../../../../../lib/amazonSp/overview';

export const maxDuration = 60;

/**
 * GET ?type=returns|reimbursements — poll a requested report.
 * While Amazon generates it: { status: 'IN_PROGRESS' }.
 * When done: { status: 'DONE', rows: [...] } parsed per report type.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const type = request.nextUrl.searchParams.get('type');
    const status = await getReportStatus(params.id);

    if (status.processingStatus === 'CANCELLED') {
      // Amazon cancels a report when there is no data in the window.
      return NextResponse.json({ success: true, status: 'DONE', rows: [], empty: true });
    }
    if (status.processingStatus === 'FATAL') {
      return NextResponse.json({ error: 'Amazon failed to generate the report.' }, { status: 500 });
    }
    if (status.processingStatus !== 'DONE' || !status.reportDocumentId) {
      return NextResponse.json({ success: true, status: status.processingStatus });
    }

    const raw = await downloadReportRows(status.reportDocumentId);
    const rows =
      type === 'returns' ? parseReturnsReportRows(raw) :
      type === 'reimbursements' ? parseReimbursementsReportRows(raw) :
      raw;
    return NextResponse.json({ success: true, status: 'DONE', rows });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Amazon report poll error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch report.' }, { status: 500 });
  }
}
