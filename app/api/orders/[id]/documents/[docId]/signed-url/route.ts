import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAuth } from '../../../../../../../platform/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    const orderId = params.id;
    const docId = params.docId;

    if (!orderId || !docId) {
      return NextResponse.json({ error: 'Missing orderId or docId' }, { status: 400 });
    }

    const auth = createAuth();
    const user = await auth.getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, company_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (user.roles.includes('admin')) {
      // Admin can access any order
    } else if (user.roles.includes('client')) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('company_id')
        .eq('id', user.id)
        .single();
      if (!clientData || clientData.company_id !== order.company_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: doc, error: docError } = await supabase
      .from('order_documents')
      .select('id, file_path')
      .eq('id', docId)
      .eq('order_id', orderId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const { data: urlData, error: urlError } = await supabase.storage
      .from('order-documents')
      .createSignedUrl(doc.file_path, 3600);

    if (urlError || !urlData?.signedUrl) {
      console.error('Signed URL error:', urlError);
      return NextResponse.json(
        { error: 'Failed to generate signed URL', details: urlError?.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: urlData.signedUrl });
  } catch (err: any) {
    console.error('Signed URL error:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
