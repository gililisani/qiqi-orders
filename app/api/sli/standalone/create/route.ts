import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';

export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireAdmin(request);
    // Parse request body
    const body = await request.json();
    const {
      company_id,
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
      selected_products,
    } = body;

    // Validate required fields
    if (!consignee_name || !consignee_address_line1 || !consignee_country || !invoice_number || !sli_date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!selected_products || selected_products.length === 0) {
      return NextResponse.json({ error: 'At least one product is required' }, { status: 400 });
    }

    const userId = adminUser.id;

    const supabaseAdmin = createServiceRoleClient();

    // Generate SLI number
    const { data: sliNumberResult, error: sliNumberError } = await supabaseAdmin
      .rpc('generate_sli_number');

    if (sliNumberError) {
      console.error('Error generating SLI number:', sliNumberError);
      return NextResponse.json({ error: 'Failed to generate SLI number', details: sliNumberError.message }, { status: 500 });
    }

    const sliNumber = sliNumberResult || 100000;

    // Create standalone SLI
    const { data: sli, error: sliError } = await supabaseAdmin
      .from('standalone_slis')
      .insert({
        sli_number: sliNumber,
        company_id: company_id || null,
        consignee_name,
        consignee_address_line1,
        consignee_address_line2: consignee_address_line2 || null,
        consignee_address_line3: consignee_address_line3 || null,
        consignee_country,
        invoice_number,
        sli_date,
        date_of_export: date_of_export || null,
        forwarding_agent_line1: forwarding_agent_line1 || null,
        forwarding_agent_line2: forwarding_agent_line2 || null,
        forwarding_agent_line3: forwarding_agent_line3 || null,
        forwarding_agent_line4: forwarding_agent_line4 || null,
        in_bond_code: in_bond_code || null,
        instructions_to_forwarder: instructions_to_forwarder || null,
        selected_products,
        checkbox_states: checkbox_states || {},
        created_by: userId,
      })
      .select()
      .single();

    if (sliError) {
      console.error('Error creating standalone SLI:', sliError);
      
      // Check if it's a column not found error (migration not run)
      if (sliError.message?.includes('column') || sliError.message?.includes('does not exist')) {
        return NextResponse.json({ 
          error: 'Database migration required', 
          details: 'Please run create_standalone_slis_table.sql in Supabase SQL Editor. Error: ' + sliError.message 
        }, { status: 500 });
      }
      
      return NextResponse.json({ error: 'Failed to create SLI', details: sliError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sli_id: sli.id,
      sli_number: sli.sli_number,
      message: 'Standalone SLI created successfully',
    });

  } catch (error: any) {
    console.error('Standalone SLI creation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
