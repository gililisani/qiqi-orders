import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';

const CONFIG_FIELDS = [
  'customer_ns_id',
  'vendor_ns_id',
  'subsidiary_ns_id',
  'location_ns_id',
  'currency_ns_id',
  'class_name',
  'bank_account_ns_id',
  'platform_fees_account_ns_id',
  'advertising_account_ns_id',
  'writeoff_account_ns_id',
  'refund_item_ns_id',
  'discount_item_ns_id',
] as const;

// GET - current config
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'amazon:view');
    const supabaseAdmin = createServiceRoleClient();
    const { data, error } = await supabaseAdmin
      .from('amazon_fba_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      if (error.message?.includes('does not exist')) {
        return NextResponse.json(
          { error: 'Database migration required', details: 'Run 20260729120000_amazon_fba.sql in the Supabase SQL editor first.' },
          { status: 500 }
        );
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ success: true, config: data });
  } catch (error: any) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: error.message || 'Failed to load config.' }, { status: 500 });
  }
}

// PUT - update config fields (only known fields, strings)
export async function PUT(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'amazon:edit');
    const body = await request.json();
    const row: Record<string, string> = {};
    for (const key of CONFIG_FIELDS) {
      if (typeof body[key] === 'string') row[key] = body[key].trim();
    }
    if (Object.keys(row).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }
    const supabaseAdmin = createServiceRoleClient();
    const { error } = await supabaseAdmin
      .from('amazon_fba_config')
      .upsert({ id: 1, ...row, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: error.message || 'Failed to save config.' }, { status: 500 });
  }
}
