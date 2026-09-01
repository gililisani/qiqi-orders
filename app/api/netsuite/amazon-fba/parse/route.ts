import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { parseReportRows, buildMonthPreviews } from '../../../../../lib/amazonFba/parseReport';

/**
 * POST { csvText } → per-month previews built against the current item map,
 * plus the mappings themselves, prior pushed batches, and config status.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'amazon:edit');
    const { csvText } = await request.json();
    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json({ error: 'No CSV content provided.' }, { status: 400 });
    }
    if (csvText.length > 10_000_000) {
      return NextResponse.json({ error: 'File too large.' }, { status: 400 });
    }

    const supabaseAdmin = createServiceRoleClient();
    const [{ data: mappings }, { data: batches }, { data: config }] = await Promise.all([
      supabaseAdmin.from('amazon_item_map').select('*').order('amazon_name'),
      supabaseAdmin.from('amazon_fba_batches').select('period, status, ns_refs, created_at'),
      supabaseAdmin.from('amazon_fba_config').select('*').eq('id', 1).maybeSingle(),
    ]);

    const { rows, errors } = parseReportRows(csvText);
    if (rows.length === 0) {
      return NextResponse.json({ error: errors[0] || 'No rows found in file.' }, { status: 400 });
    }

    const previews = buildMonthPreviews(
      rows,
      (mappings || []).map((m: any) => ({
        amazon_name: m.amazon_name,
        ns_item_id: m.ns_item_id,
        ns_item_name: m.ns_item_name,
        unit_price: Number(m.unit_price),
      }))
    );

    return NextResponse.json({
      success: true,
      previews,
      parseErrors: errors,
      mappings: mappings || [],
      batches: batches || [],
      config: config || null,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Amazon FBA parse error:', error);
    return NextResponse.json({ error: error.message || 'Failed to parse report.' }, { status: 500 });
  }
}
