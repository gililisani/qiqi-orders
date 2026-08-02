import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../../lib/netsuite';

/**
 * GET ?q=<term>          → NetSuite item search (for product mapping)
 * GET ?type=discount     → all Discount-type items (for the settings panel)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    const type = request.nextUrl.searchParams.get('type');
    const ns = createNetSuiteAPI();

    if (type === 'discount') {
      const items = await ns.suiteQL<{ id: string; itemid: string }>(
        `SELECT id, itemid FROM item WHERE itemtype = 'Discount' ORDER BY itemid`
      );
      return NextResponse.json({ success: true, items });
    }

    if (q.length < 2) {
      return NextResponse.json({ success: true, items: [] });
    }
    const escaped = q.toLowerCase().replace(/'/g, "''").replace(/[%_]/g, '');
    const items = await ns.suiteQL<{ id: string; itemid: string; displayname: string }>(
      `SELECT id, itemid, displayname
         FROM item
        WHERE (LOWER(itemid) LIKE '%${escaped}%' OR LOWER(displayname) LIKE '%${escaped}%')
          AND ROWNUM <= 20
        ORDER BY itemid`
    );
    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Amazon FBA item search error:', error);
    return NextResponse.json({ error: error.message || 'Item search failed.' }, { status: 500 });
  }
}
