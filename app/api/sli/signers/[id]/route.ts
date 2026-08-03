import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../../platform/auth/guards';
import { validateSignature } from '../../../../../lib/sli/signatureValidation';

// PUT - update a signer (fields present in the body are updated)
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requireAdmin(request);
    const body = await request.json();
    const { name, title, email, phone, signature_url, is_default } = body;
    const supabaseAdmin = createServiceRoleClient();

    const updateData: Record<string, any> = {};
    if (name !== undefined) {
      if (!name || !String(name).trim()) {
        return NextResponse.json({ error: 'Signer name is required.' }, { status: 400 });
      }
      updateData.name = String(name).trim();
    }
    if (title !== undefined) updateData.title = String(title || '').trim();
    if (email !== undefined) updateData.email = String(email || '').trim();
    if (phone !== undefined) updateData.phone = String(phone || '').trim();
    if (signature_url !== undefined) {
      const sigError = validateSignature(signature_url);
      if (sigError) return NextResponse.json({ error: sigError }, { status: 400 });
      updateData.signature_url = signature_url || '';
    }
    if (is_default !== undefined) {
      updateData.is_default = !!is_default;
      if (is_default) {
        await supabaseAdmin
          .from('sli_signers')
          .update({ is_default: false })
          .eq('is_default', true)
          .neq('id', params.id);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('sli_signers')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating SLI signer:', error);
      return NextResponse.json({ error: 'Failed to update signer', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, signer: data });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error updating SLI signer:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE - remove a signer (existing SLIs keep rendering via the default signer)
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requireAdmin(request);
    const supabaseAdmin = createServiceRoleClient();

    // Don't allow deleting the default signer — pick another default first.
    const { data: signer } = await supabaseAdmin
      .from('sli_signers')
      .select('is_default')
      .eq('id', params.id)
      .maybeSingle();

    if (signer?.is_default) {
      return NextResponse.json(
        { error: 'Cannot delete the default signer. Set another signer as default first.' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from('sli_signers').delete().eq('id', params.id);

    if (error) {
      console.error('Error deleting SLI signer:', error);
      return NextResponse.json({ error: 'Failed to delete signer', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error deleting SLI signer:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
