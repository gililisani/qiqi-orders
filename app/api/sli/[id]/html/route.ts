import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSLIHTML } from '../../../../../lib/sliGenerator';
import { buildStandaloneSLIData } from '../../../../../lib/sli/buildStandaloneSLIData';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sliId = params.id;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data: sli, error: sliError } = await supabaseAdmin
      .from('standalone_slis')
      .select('*')
      .eq('id', sliId)
      .single();

    if (sliError || !sli) {
      return NextResponse.json({ error: 'SLI not found' }, { status: 404 });
    }

    const generatorData = await buildStandaloneSLIData(sli, supabaseAdmin);
    const html = generateSLIHTML(generatorData);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });

  } catch (error: any) {
    console.error('Error generating SLI HTML:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate SLI HTML' }, { status: 500 });
  }
}
