import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

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

    // Get user from cookies (for created_by field)
    const cookieStore = cookies();
    const allCookies = cookieStore.getAll();
    
    // Find the Supabase auth token cookie
    const authCookie = allCookies.find(cookie => 
      cookie.name.includes('auth-token') || cookie.name.includes('sb-')
    );
    
    let userId = null;
    if (authCookie) {
      try {
        const { data: { user } } = await supabaseAdmin.auth.getUser(authCookie.value);
        userId = user?.id || null;
      } catch (err) {
        console.log('Could not get user from cookie, proceeding without created_by');
      }
    }

    // Create standalone SLI
    const { data: sli, error: sliError } = await supabaseAdmin
      .from('slis')
      .insert({
        order_id: null, // Standalone SLI
        sli_type: 'standalone',
        created_by: userId,
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
