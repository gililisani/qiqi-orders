import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSLIHTML } from '../../../../lib/sliGenerator';
import { buildStandaloneSLIData } from '../../../../lib/sli/buildStandaloneSLIData';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const sliPayload = await request.json();

    const supabaseAdmin = createServiceRoleClient();

    const generatorData = await buildStandaloneSLIData(sliPayload, supabaseAdmin);
    const html = generateSLIHTML(generatorData);

    return NextResponse.json({ html });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error generating SLI HTML:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate SLI HTML' }, { status: 500 });
  }
}

