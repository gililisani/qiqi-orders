import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSLIHTML } from '../../../../lib/sliGenerator';
import { buildStandaloneSLIData } from '../../../../lib/sli/buildStandaloneSLIData';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const sliPayload = await request.json();

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const generatorData = await buildStandaloneSLIData(sliPayload, supabaseAdmin);
    const html = generateSLIHTML(generatorData);

    return NextResponse.json({ html });
  } catch (error: any) {
    console.error('Error generating SLI HTML:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate SLI HTML' }, { status: 500 });
  }
}

