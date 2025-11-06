import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// GET - Fetch standalone SLI
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sliId = params.id;

    const { data: sli, error: sliError } = await supabaseAdmin
      .from('standalone_slis')
      .select(`
        *,
        company:companies(company_name)
      `)
      .eq('id', sliId)
      .single();

    if (sliError || !sli) {
      return NextResponse.json({ error: 'SLI not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, sli });
  } catch (error: any) {
    console.error('Error fetching standalone SLI:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update standalone SLI
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sliId = params.id;
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

    // Update standalone SLI
    const { data: sli, error: sliError } = await supabaseAdmin
      .from('standalone_slis')
      .update({
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
      })
      .eq('id', sliId)
      .select()
      .single();

    if (sliError) {
      console.error('Error updating standalone SLI:', sliError);
      return NextResponse.json({ error: 'Failed to update SLI', details: sliError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sli_id: sli.id,
      sli_number: sli.sli_number,
      message: 'Standalone SLI updated successfully',
    });

  } catch (error: any) {
    console.error('Standalone SLI update error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete standalone SLI
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sliId = params.id;

    const { error: deleteError } = await supabaseAdmin
      .from('standalone_slis')
      .delete()
      .eq('id', sliId);

    if (deleteError) {
      console.error('Error deleting standalone SLI:', deleteError);
      return NextResponse.json({ error: 'Failed to delete SLI', details: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Standalone SLI deleted successfully',
    });

  } catch (error: any) {
    console.error('Standalone SLI deletion error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

