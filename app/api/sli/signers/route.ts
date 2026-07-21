import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';
import { validateSignature } from '../../../../lib/sli/signatureValidation';

// GET - list signers
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabaseAdmin = createServiceRoleClient();

    const { data, error } = await supabaseAdmin
      .from('sli_signers')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      // Table missing (migration not applied yet) — return empty list, not a crash.
      return NextResponse.json({ success: true, signers: [] });
    }

    return NextResponse.json({ success: true, signers: data || [] });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error listing SLI signers:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST - add a signer
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const { name, title, email, phone, signature_url, is_default } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Signer name is required.' }, { status: 400 });
    }
    const sigError = validateSignature(signature_url);
    if (sigError) return NextResponse.json({ error: sigError }, { status: 400 });

    const supabaseAdmin = createServiceRoleClient();

    if (is_default) {
      await supabaseAdmin.from('sli_signers').update({ is_default: false }).eq('is_default', true);
    }

    const { data, error } = await supabaseAdmin
      .from('sli_signers')
      .insert({
        name: name.trim(),
        title: (title || '').trim(),
        email: (email || '').trim(),
        phone: (phone || '').trim(),
        signature_url: signature_url || '',
        is_default: !!is_default,
      })
      .select()
      .single();

    if (error) {
      if (error.message?.includes('does not exist')) {
        return NextResponse.json(
          {
            error: 'Database migration required',
            details:
              'Run 20260721120000_sli_config_and_signers.sql in the Supabase SQL editor first.',
          },
          { status: 500 }
        );
      }
      console.error('Error creating SLI signer:', error);
      return NextResponse.json({ error: 'Failed to create signer', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, signer: data }, { status: 201 });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error creating SLI signer:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
