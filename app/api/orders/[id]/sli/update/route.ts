import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;
    const {
      forwarding_agent_line1,
      forwarding_agent_line2,
      forwarding_agent_line3,
      forwarding_agent_line4,
      date_of_export,
      in_bond_code,
      instructions_to_forwarder,
      checkbox_states
    } = await request.json();

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Get current user (admin)
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is admin
    const { data: admin, error: adminError } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Check if SLI exists
    const { data: existingSLI, error: checkError } = await supabaseAdmin
      .from('slis')
      .select('id')
      .eq('order_id', orderId)
      .single();

    if (checkError || !existingSLI) {
      return NextResponse.json({ error: 'SLI not found for this order' }, { status: 404 });
    }

    // Update SLI (only the 4 popup fields + checkboxes + signature)
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (forwarding_agent_line1 !== undefined) updateData.forwarding_agent_line1 = forwarding_agent_line1;
    if (forwarding_agent_line2 !== undefined) updateData.forwarding_agent_line2 = forwarding_agent_line2;
    if (forwarding_agent_line3 !== undefined) updateData.forwarding_agent_line3 = forwarding_agent_line3;
    if (forwarding_agent_line4 !== undefined) updateData.forwarding_agent_line4 = forwarding_agent_line4;
    if (date_of_export !== undefined) updateData.date_of_export = date_of_export;
    if (in_bond_code !== undefined) updateData.in_bond_code = in_bond_code;
    if (instructions_to_forwarder !== undefined) updateData.instructions_to_forwarder = instructions_to_forwarder;
    if (checkbox_states !== undefined) updateData.checkbox_states = checkbox_states;

    const { data: updatedSLI, error: updateError } = await supabaseAdmin
      .from('slis')
      .update(updateData)
      .eq('order_id', orderId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating SLI:', updateError);
      return NextResponse.json({ error: 'Failed to update SLI' }, { status: 500 });
    }

    return NextResponse.json({ success: true, sli: updatedSLI }, { status: 200 });
  } catch (error: any) {
    console.error('Error in SLI update API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

