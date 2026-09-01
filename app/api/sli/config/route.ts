import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { SLI_CONFIG_DEFAULTS, mergeSLIConfig } from '../../../../lib/sli/sliConfig';

const CONFIG_KEYS = Object.keys(SLI_CONFIG_DEFAULTS) as (keyof typeof SLI_CONFIG_DEFAULTS)[];

// GET - current SLI config (merged over defaults)
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'config:view');
    const supabaseAdmin = createServiceRoleClient();

    const { data } = await supabaseAdmin.from('sli_config').select('*').eq('id', 1).maybeSingle();

    return NextResponse.json({ success: true, config: mergeSLIConfig(data) });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error fetching SLI config:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// PUT - update SLI config (upsert the singleton row)
export async function PUT(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'config:edit');
    const body = await request.json();
    const supabaseAdmin = createServiceRoleClient();

    const row: Record<string, string> = {};
    for (const key of CONFIG_KEYS) {
      if (typeof body[key] === 'string') row[key] = body[key].trim();
    }

    const { error } = await supabaseAdmin
      .from('sli_config')
      .upsert({ id: 1, ...row, updated_at: new Date().toISOString() });

    if (error) {
      if (error.message?.includes('does not exist')) {
        return NextResponse.json(
          {
            error: 'Database migration required',
            details:
              'Run 20260721120000_sli_config_and_signers.sql in the Supabase SQL editor first.',
          },
          { status: 500 }
        );
      }
      console.error('Error saving SLI config:', error);
      return NextResponse.json({ error: 'Failed to save SLI config', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error updating SLI config:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
