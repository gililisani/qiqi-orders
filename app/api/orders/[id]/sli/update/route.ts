import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../../../platform/auth/guards';

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
      checkbox_states,
      signer_id
    } = await request.json();

    // Standard admin guard (was a hand-rolled token+admins lookup that
    // skipped the enabled check — audit 1.3 pattern).
    await requireAdmin(request);
    const supabaseAdmin = createServiceRoleClient();

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
    if (signer_id !== undefined) updateData.signer_id = signer_id || null;

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
    if (error instanceof Response) return error;
    console.error('Error in SLI update API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
