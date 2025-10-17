import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function POST(request: NextRequest) {
  try {
    // Get current user from auth header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is admin using cookie-based auth
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            cookie: request.headers.get('cookie') || ''
          }
        }
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: adminProfile, error: adminError } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();

    if (adminError || !adminProfile) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const {
      consignee_name,
      consignee_address_line1,
      consignee_address_line2,
      consignee_address_line3,
      consignee_country,
      invoice_number,
      sli_date,
      date_of_export,
      forwarding_agent_line1,
      forwarding_agent_line2,
      forwarding_agent_line3,
      forwarding_agent_line4,
      in_bond_code,
      instructions_to_forwarder,
      checkbox_states,
      manual_products,
    } = body;

    // Validate required fields
    if (!consignee_name || !consignee_address_line1 || !consignee_country || !invoice_number || !sli_date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!manual_products || manual_products.length === 0) {
      return NextResponse.json({ error: 'At least one product is required' }, { status: 400 });
    }

    // Create standalone SLI
    const { data: sli, error: sliError } = await supabaseAdmin
      .from('slis')
      .insert({
        order_id: null, // Standalone SLI
        sli_type: 'standalone',
        created_by: user.id,
        consignee_name,
        consignee_address_line1,
        consignee_address_line2,
        consignee_address_line3,
        consignee_country,
        invoice_number,
        sli_date,
        date_of_export: date_of_export || null,
        forwarding_agent_line1,
        forwarding_agent_line2,
        forwarding_agent_line3,
        forwarding_agent_line4,
        in_bond_code,
        instructions_to_forwarder,
        checkbox_states,
        manual_products,
      })
      .select()
      .single();

    if (sliError) {
      console.error('Error creating standalone SLI:', sliError);
      return NextResponse.json({ error: 'Failed to create SLI', details: sliError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sli_id: sli.id,
      message: 'Standalone SLI created successfully',
    });

  } catch (error: any) {
    console.error('Standalone SLI creation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

